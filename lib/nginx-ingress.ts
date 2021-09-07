import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';

export interface IngressNginxControllerProps {
    eksCluster: eks.ICluster;
}

interface HelmValues {
    [key: string]: any;
}

export class IngressNginxController extends cdk.Construct {
    constructor(
        scope: cdk.Construct,
        id: string,
        props: IngressNginxControllerProps
    ) {
        super(scope,id)

        // Deploy Ingress Nginx Controller from the Helm chart
        const helmValues = {
            rbac: {
                create: true,
            },
            tcp: {
                '2222': 'hub/ssh-bastion-server:2222',
            },
            defaultBackend: {
                enabled: true,
                resources: {
                    limits: {
                        cpu: '250m',
                        memory: '100Mi',
                    },
                    requests: {
                        cpu: '100m',
                        memory: '64Mi',
                    },
                }
            },
            controller: {
                hostNetwork: true,
                admissionWebhooks: {
                    enabled: false,
                },
                config: {
                    'use-forwarded-headers': 'true',
                },
                containerPort: {
                    http: 80,
                    https: 443,
                },
                service: {
                    targetPorts: {
                        http: 'http',
                        https: 'https',
                    },
                    annotations: {
                        'service.beta.kubernetes.io/aws-load-balancer-backend-protocol': 'tcp',
                        'service.beta.kubernetes.io/aws-load-balancer-type': 'nlb',
                    },
                },
                resources: {
                    limits: {
                        cpu: '250m',
                        memory: '200Mi',
                    },
                    requests: {
                        cpu: '100m',
                        memory: '100Mi',
                    },
                }
            },
        } as HelmValues;

        // Apply helm chart
        props.eksCluster.addHelmChart('ingress-nginx-controller', {
            chart: 'ingress-nginx',
            repository: 'https://kubernetes.github.io/ingress-nginx',
            createNamespace: true,
            namespace: 'ingress-nginx',
            release: 'nginx-ingress',
            values: helmValues,
            wait: true,
        });
    }
}