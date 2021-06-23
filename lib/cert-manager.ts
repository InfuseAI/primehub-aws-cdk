import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';

export interface CertManagerProps {
    eksCluster: eks.ICluster,
}

interface HelmValues {
    [key: string]: any;
}

const issuer = {
    apiVersion: 'cert-manager.io/v1alpha2',
    kind: 'ClusterIssuer',
    metadata: {
        name: 'letsencrypt-prod'
    },
    spec: {
        acme: {
            email: 'support@infuseai.io',
            server: 'https://acme-v02.api.letsencrypt.org/directory',
            privateKeySecretRef: {
                name: 'letsencrypt'
            },
            solvers: [
                { http01: { ingress: { class: 'nginx' } } }
            ]
            
        }
    }
};

export class CertManager extends cdk.Construct {
    constructor(
        scope: cdk.Construct,
        id: string,
        props: CertManagerProps
    ) {
        super(scope, id);
        const helmValues = {
           installCRDs: true,
            ingressShim: {
                defaultIssuerName: 'letsencrypt-prod',
                defaultIssuerKind: 'ClusterIssuer',
            }
        } as HelmValues;

        // Apply Cert Manager helm chart
        const certManager = props.eksCluster.addHelmChart('cert-manager', {
            chart: 'cert-manager',
            repository: 'https://charts.jetstack.io',
            namespace: 'kube-system',
            release: 'cert-manager',
            version: 'v0.15.0',
            values: helmValues,
            wait: true,
        });

        const clusterIssuer = new eks.KubernetesManifest(this, id, {
            cluster: props.eksCluster,
            manifest: [issuer],
            overwrite: true
        });
        
        clusterIssuer.node.addDependency(certManager);
    }
};