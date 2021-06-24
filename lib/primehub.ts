import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deploy from '@aws-cdk/aws-s3-deployment';
import * as crypto from 'crypto';
import * as YAML from 'yaml';
import { writeFileSync, mkdirSync}  from 'fs';
import { RemovalPolicy } from '@aws-cdk/aws-s3/node_modules/@aws-cdk/core';

export interface PrimeHubProps {
    eksCluster: eks.ICluster,
    clusterName: string,
    primehubDomain: string,
    primehubPassword: string,
    keycloakPassword: string,
    account: string,
    region: string
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

        const helmValues = {
            customImage: {
              registryEndpoint: `https://${props.account}.dkr.ecr.${props.region}.amazonaws.com`,
              pushRepoPrefix: `${props.account}.dkr.ecr.${props.region}.amazonaws.com`,
              pushSecretName: 'aws-registry'
            },
            primehub: {
                domain: props.primehubDomain,
                mode: 'ee',
                scheme: 'https',
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

        // Apply PrimeHub helm chart
        props.eksCluster.addHelmChart('primehub', {
            chart: 'primehub',
            repository: 'https://charts.infuseai.io',
            createNamespace: true,
            namespace: 'hub',
            release: 'primehub',
            values: helmValues,
            timeout: cdk.Duration.minutes(15),
            wait: false,
        });

        const primehubEnv = `PRIMEHUB_MODE=ee
PRIMEHUB_NAMESPACE=hub
PRIMEHUB_DOMAIN=${props.primehubDomain}
PRIMEHUB_SCHEME=https
PRIMEHUB_STORAGE_CLASS=gp2
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
        const bucket = new s3.Bucket(this, `${props.clusterName}-s3-bucket`, {
          autoDeleteObjects: true,
          removalPolicy: RemovalPolicy.DESTROY,
          bucketName: props.clusterName,
        });

        new s3deploy.BucketDeployment(this, 'primehub-yaml', {
          sources: [ s3deploy.Source.asset(`./artifact/${props.clusterName}`) ],
          destinationBucket: bucket,
        });
    }
}
