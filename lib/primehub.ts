import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';
import * as crypto from 'crypto';

export interface PrimeHubProps {
    eksCluster: eks.ICluster,
    primehubDomain: string,
    primehubPassword: string,
    keycloakPassword: string,
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
    }
}