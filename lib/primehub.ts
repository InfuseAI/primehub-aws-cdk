import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as crypto from 'crypto';
import * as YAML from 'yaml';
import { writeFileSync, mkdirSync}  from 'fs';

export interface PrimeHubProps {
    eksCluster: eks.ICluster,
    clusterName: string,
    ecrRepoName: string,
    primehubMode: string,
    primehubDomain: string,
    primehubUserEmail: string,
    acmeEnabled: boolean,
    sshCustomHostname?: string,
    primehubVersion?: string,
    primehubPassword: string,
    keycloakPassword: string,
    account: string,
    region: string,
    primehubConfigBucket: string,
    sharedVolumeStorageClass?: string,
    primehubStoreBucket?: string,
    dryRunMode?: boolean,
    cpuInstance: string,
    gpuInstance: string,
    enforceUpdatePassword?: boolean
}

interface HelmValues {
    [key: string]: any;
}

export class PrimeHub extends cdk.Construct {
    constructor(
        scope: cdk.Construct,
        id: string,
        props: PrimeHubProps,
    ) {
        super(scope, id)

        const graphqlSecretKey = scope.node.tryGetContext('GraphqlSecretKey') || process.env.ADMIN_UI_GRAPHQL_SECRET_KEY || crypto.randomBytes(32).toString('hex');
        const hubProxySecretKey = scope.node.tryGetContext('HubProxySecretKey') || process.env.HUB_PROXY_SECRET_TOKEN || crypto.randomBytes(32).toString('hex');

        const enabledPrimeHubStore = (props.primehubStoreBucket) ? true : false;
        const instanceTypes = [PrimeHub.generateInstanceTypeConfig(props.cpuInstance), PrimeHub.generateInstanceTypeConfig(props.gpuInstance)].flat();

        const helmValues = {
            customImage: {
              registryEndpoint: `https://${props.account}.dkr.ecr.${props.region}.amazonaws.com`,
              pushRepo: `${props.account}.dkr.ecr.${props.region}.amazonaws.com/${props.ecrRepoName}`,
              pushSecretName: 'aws-registry'
            },
            primehub: {
                domain: props.primehubDomain,
                mode: props.primehubMode,
                scheme: 'https',
                // Temporarily disable EFS storage class and wait the csi-driver PR merged
                //   https://github.com/kubernetes-sigs/aws-efs-csi-driver/pull/434
                sharedVolumeStorageClass: props.sharedVolumeStorageClass,
            },
            keycloak: {
                password: props.keycloakPassword,
                postgresql: {
                    persistence: {
                        storageClass: 'gp2'
                    }
                }
            },
            ingress: {
                enabled: true,
                annotations: {
                    'ingress.kubernetes.io/affinity': 'cookie',
                    'kubernetes.io/ingress.class': 'nginx',
                    'kubernetes.io/tls-acme': props.acmeEnabled ? 'true' : 'false',
                },
                hosts: [ props.primehubDomain ],
                tls: [{hosts: [props.primehubDomain], secretName: 'hub-tls'}],
            },
            groupvolume: {
                storageClass: 'gp2'
            },
            bootstrap: {
                email: props.primehubUserEmail,
                password: props.primehubPassword,
                enforceUpdatePassword: props.enforceUpdatePassword,
                instanceTypes: instanceTypes
            },
            graphql: {
                sharedGraphqlSecret: graphqlSecretKey
            },
            usage: {
              dbStorageClass: 'gp2'
            },
            store: {
              enabled: enabledPrimeHubStore,
              bucket: props.primehubStoreBucket,
              createBucket: {
                enabled: false
              },
            },
            minio: {
              s3gateway: {
                enabled: enabledPrimeHubStore,
                serviceEndpoint: `https://s3.${props.region}.amazonaws.com/`,
                accessKey: null,
                secretKey: null
              }
            },
            jupyterhub: {
                auth: {
                    state: {
                        cryptoKey: graphqlSecretKey
                    }
                },
                hub: {
                    db: {
                        pvc: {
                            storageClassName: 'gp2'
                        }
                    },
                    extraEnv: [
                      {
                        name: 'KC_CLIENT_SECRET',
                        valueFrom: {
                          secretKeyRef: {
                            name: 'primehub-client-jupyterhub',
                            key: 'client_secret'
                          }
                        }
                      },
                      {
                        name: 'GRAPHQL_SHARED_SECRET',
                        valueFrom: {
                          secretKeyRef: {
                            name: 'primehub-graphql-shared-secret',
                            key: 'sharedSecret'
                          }
                        }
                      },
                      {
                        name: 'OAUTH_CALLBACK_URL',
                        value: `https://${props.primehubDomain}/hub/oauth_callback`
                      }
                    ],
                },
                proxy: {
                    secretToken: hubProxySecretKey,
                },
                scheduling: {
                    userScheduler: {
                        enabled: true,
                        replicas: 1,
                        image: {
                            tag: 'v1.19.8'
                        }
                    },
                    podPriority: {
                        enabled: true,
                    },
                    userPlaceholder: {
                        enabled: false,
                    },
                    userPods: {
                        nodeAffinity: {
                            matchNodePurpose: 'require'
                        }
                    }
                }
            },
            sshBastionServer: {
              enabled: true,
              customHostname: (props.sshCustomHostname) ? props.sshCustomHostname : '',
            },
        } as HelmValues

        if (!props.dryRunMode) {
          // Apply PrimeHub helm chart
          props.eksCluster.addHelmChart('primehub', {
              chart: 'primehub',
              repository: 'https://charts.infuseai.io',
              createNamespace: true,
              namespace: 'hub',
              release: 'primehub',
              values: helmValues,
              version: props.primehubVersion || '',
              timeout: cdk.Duration.minutes(15),
              wait: false,
          });
        }

        const primehubEnv = `PRIMEHUB_MODE=${props.primehubMode}
PRIMEHUB_NAMESPACE=hub
PRIMEHUB_DOMAIN=${props.primehubDomain}
PRIMEHUB_SCHEME=https
PRIMEHUB_STORAGE_CLASS=gp2
GROUP_VOLUME_STORAGE_CLASS=${props.sharedVolumeStorageClass}
KC_DOMAIN=${props.primehubDomain}
KC_SCHEME=https
KC_USER=keycloak
KC_PASSWORD=${props.keycloakPassword}
KC_REALM=primehub
ADMIN_UI_GRAPHQL_SECRET_KEY=${graphqlSecretKey}
HUB_AUTH_STATE_CRYPTO_KEY=${graphqlSecretKey}
HUB_PROXY_SECRET_TOKEN=${hubProxySecretKey}
PH_PASSWORD=${props.primehubPassword}
METACONTROLLER_DEPLOY=true
KEYCLOAK_DEPLOY=true`;
        const primehubHelmOverride = new YAML.Document();
        primehubHelmOverride.contents = helmValues;
        mkdirSync(`./artifact/${props.clusterName}/helm_override`, {recursive: true});
        writeFileSync(`./artifact/${props.clusterName}/helm_override/primehub.yaml`, primehubHelmOverride.toString());
        writeFileSync(`./artifact/${props.clusterName}/.env`, primehubEnv);

        // Create S3 bucket to store primehub.yaml
        const bucket = new s3.Bucket(this, `${props.primehubConfigBucket}-s3-bucket`, {
          autoDeleteObjects: true,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          bucketName: props.primehubConfigBucket,
        });

        new s3deploy.BucketDeployment(this, 'primehub-yaml', {
          sources: [ s3deploy.Source.asset(`./artifact/${props.clusterName}`) ],
          destinationBucket: bucket,
        });
    }

    static calculateInstanceSize(instanceClass: string, instanceSize: string): number[] {
      let cpu: number = 2;
      let memory: number = 8;
      let gpu: number = 0;

      const instanceSizeMap: HelmValues = {
        'xlarge': {
          cpu: 4,
          memory: 16,
        },
        '2xlarge': {
          cpu: 8,
          memory: 32,
        },
        '4xlarge': {
          cpu: 16,
          memory: 64,
        },
        '8xlarge': {
          cpu: 32,
          memory: 128,
        },
        '12xlarge': {
          cpu: 48,
          memory: 192,
        },
        '16xlarge': {
          cpu: 64,
          memory: 256,
        },
        '24xlarge': {
          cpu: 96,
          memory: 384,
        },
        'metal': {
          cpu: 96,
          memory: 384,
        }
      };

      if (instanceSizeMap[instanceSize]) {
        cpu = instanceSizeMap[instanceSize].cpu;
        memory = instanceSizeMap[instanceSize].memory;
      }

      // AWS EC2 Compute Optimized Instance has less memory
      // Ref: https://aws.amazon.com/ec2/instance-types/
      if (instanceClass.startsWith('c')) {
        memory = memory / 2;
      }

      // AWS EC2 Compute Optimized
      if (instanceClass === 'g4dn') {
        switch (instanceSize) {
          case '12xlarge':
            gpu = 4;
            break;
          case 'metal':
            gpu = 8;
          default:
            gpu = 1;
            break;
        }
      }
      else if (instanceClass === 'p3' || instanceClass === 'p3dn') {
        switch (instanceSize) {
          case '2xlarge':
            gpu = 1;
            break;
          case '8xlarge':
            gpu = 4;
            break;
          case '16xlarge':
            gpu = 8
            break;
          case '24xlarge':
            gpu = 8
            break;
        }
      }

      return [cpu, memory, gpu];
    }

    static generateInstanceTypeConfig(instanceType: string): HelmValues[] {
      const instanceTypesConfig: HelmValues[] = [];
      const [instanceClass, instanceSize] = instanceType.split('.');
      const [cpu, memory, gpu] = this.calculateInstanceSize(instanceClass, instanceSize);
      const groupType = (gpu > 0) ? 'GPU' : 'CPU';
      const gpuToleration = {
        key: 'nvidia.com/gpu',
        operator: 'Exists',
        effect: 'NoSchedule',
        value: 'true'
      };

      // Quarter Instance
      if ( cpu/4 >= 1 ) {
        const quarterGpu = (gpu/4 >= 1) ? gpu / 4 : gpu;
        const quarterCpu = cpu/4;
        const quarterMemory = memory/4;
        const quarterInstance = {
            metadata: {
              name: `${instanceType}-quarter`
            },
            spec: {
              'description': `CPU: ${quarterCpu} / Memory: ${quarterMemory}G / GPU: ${quarterGpu}`,
              'displayName': `[${groupType}] ${instanceType} -> Quarter`,
              'limits.cpu': quarterCpu,
              'limits.memory': `${quarterMemory}G`,
              'limits.nvidia.com/gpu':  quarterGpu,
              'requests.cpu': quarterCpu*8/10,
              'requests.memory': `${quarterMemory*8/10}G`,
              'nodeSelector': {
                'instance-type': instanceType,
                'component': 'singleuser-server',
              },
              'tolerations': [{
                key: "hub.jupyter.org/dedicated",
                operator: "Equal",
                value: "user",
                effect: "NoSchedule",
              }],
            }
          };
          if (quarterGpu > 0) {
            quarterInstance.spec.tolerations.push({...gpuToleration});
          }
          instanceTypesConfig.push(quarterInstance);
      }

      // Half Instance
      const halfGpu = (gpu/2 >= 1) ? gpu / 2 : gpu;
      const halfCpu = cpu/2;
      const halfMemory = memory/2;
      const halfInstance = {
        metadata: {
          name: `${instanceType}-half`
        },
        spec: {
          'description': `CPU: ${halfCpu} / Memory: ${halfMemory}G / GPU: ${halfGpu}`,
          'displayName': `[${groupType}] ${instanceType} -> Half`,
          'limits.cpu': halfCpu,
          'limits.memory': `${halfMemory}G`,
          'limits.nvidia.com/gpu':  halfGpu,
          'requests.cpu': halfCpu*8/10,
          'requests.memory': `${halfMemory*8/10}G`,
          'nodeSelector': {
            'instance-type': instanceType,
            'component': 'singleuser-server',
          },
          'tolerations': [{
            key: "hub.jupyter.org/dedicated",
            operator: "Equal",
            value: "user",
            effect: "NoSchedule",
          }],
        }
      };
      if (gpu > 0) {
        halfInstance.spec.tolerations.push({...gpuToleration});
      }
      instanceTypesConfig.push(halfInstance);

      // Full Instance
      const fullInstance = {
        metadata: {
          name: `${instanceType}-full`
        },
        spec: {
          'description': `CPU: ${cpu} / Memory: ${memory}G / GPU: ${gpu}`,
          'displayName': `[${groupType}] ${instanceType} -> Full`,
          'limits.cpu': cpu,
          'limits.memory': `${memory}G`,
          'limits.nvidia.com/gpu':  gpu,
          'requests.cpu': cpu*8/10,
          'requests.memory': `${memory*8/10}G`,
          'nodeSelector': {
            'instance-type': instanceType,
            'component': 'singleuser-server',
          },
          'tolerations': [{
              key: "hub.jupyter.org/dedicated",
              operator: "Equal",
              value: "user",
              effect: "NoSchedule",
          }],
        }
      };
      if (gpu > 0) {
        fullInstance.spec.tolerations.push({...gpuToleration});
      }
      instanceTypesConfig.push(fullInstance);

      return instanceTypesConfig;
    }
}
