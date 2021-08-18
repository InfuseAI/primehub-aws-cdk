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
    primehubMode: string,
    primehubDomain: string,
    primehubVersion?: string,
    primehubPassword: string,
    keycloakPassword: string,
    account: string,
    region: string,
    primehubConfigBucket: string,
    sharedVolumeStorageClass?: string,
    primehubStoreBucket?: string,
    dryRunMode?: boolean,
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

        const helmValues = {
            customImage: {
              registryEndpoint: `https://${props.account}.dkr.ecr.${props.region}.amazonaws.com`,
              pushRepoPrefix: `${props.account}.dkr.ecr.${props.region}.amazonaws.com`,
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
                    'kubernetes.io/tls-acme': 'true',
                },
                hosts: [ props.primehubDomain ],
                tls: [{hosts: [props.primehubDomain], secretName: 'hub-tls'}],
            },
            groupvolume: {
                storageClass: 'gp2'
            },
            bootstrap: {
                password: props.primehubPassword
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
                    }
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
              version: props.primehubVersion,
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
}
