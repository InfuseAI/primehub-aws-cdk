// import autoscaling = require('@aws-cdk/aws-autoscaling');
import iam = require('@aws-cdk/aws-iam');
import ec2 = require('@aws-cdk/aws-ec2');
import eks = require('@aws-cdk/aws-eks');
import cdk = require('@aws-cdk/core');
import route53 = require('@aws-cdk/aws-route53');

import { InstanceType } from '@aws-cdk/aws-ec2';
import { IngressNginxController } from './nginx-ingress';
import { CertManager } from './cert-manager';
import { PrimeHub } from './primehub';
import * as crypto from 'crypto';

// import { Cluster } from '@aws-cdk/aws-eks';

const username = process.env.USERNAME || 'dev@infuseai.io';
const name = process.env.NAME || 'cdk';
const basedDomain = process.env.AWS_BASED_DOMAIN || 'aws.primehub.io';
const primehubPassword = process.env.PH_PASSWORD || crypto.randomBytes(32).toString('hex');;
const keycloakPassword = process.env.KC_PASSWORD || crypto.randomBytes(32).toString('hex');

export interface EksStackProps extends cdk.StackProps {
  clusterName:  string;
  basedDomain:  string;
  masterRole?:  string;
}

export class EKSCluster extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: EksStackProps) {
    super(scope, id, props);
    let masterRole;

    const vpc = new ec2.Vpc(this, 'vpc', {
      natGateways: 0,
    });  // Create a new VPC for our cluster
    
    // IAM role for our EC2 worker nodes
    // const workerRole = new iam.Role(this, 'eks-worker-role', {
    //   assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    // });

    // cluster master role
    if (props.masterRole) {
      masterRole = iam.Role.fromRoleArn(this, 'imported-master-rold', props.masterRole);
    } else {
      masterRole = new iam.Role(this, 'eks-master-role', {
        assumedBy: new iam.AnyPrincipal(),
      });
    }


    const eksCluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_20,
      mastersRole: masterRole,
      clusterName: props.clusterName,
      outputClusterName: true,

      // Networking related settings listed below - important in enterprise context.
      endpointAccess: eks.EndpointAccess.PUBLIC, // In Enterprise context, you may want to set it to PRIVATE.
      vpc: vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PUBLIC}], // you can also specify the subnets by other attributes 
      defaultCapacity: 0,
    });

    eksCluster.addNodegroupCapacity('Default-Node-Group',{
      desiredSize: 1,
      minSize: 1,
      maxSize: 3,
      instanceTypes: [new InstanceType('t3a.xlarge')],
      subnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      tags: {
        Name: `ekc-${name}-default-node-group`,
        cluster: props.clusterName,
        owner: username,
        clusterType: "dev-eks"
      },
    });

    const ingressNginx = new IngressNginxController(this, 'ingress-nginx-controller', {
      eksCluster: eksCluster,
    });

    const certManager = new CertManager(this, 'cert-manager', {
      eksCluster: eksCluster
    });

    const awsElbAddress = new eks.KubernetesObjectValue(this, 'AWS-ELB', {
      cluster: eksCluster,
      objectType: 'service',
      objectName: 'nginx-ingress-ingress-nginx-controller',
      objectNamespace: 'ingress-nginx',
      jsonPath: '.status.loadBalancer.ingress[0].hostname'
    });

    // Setup DNS record by AWS ELB
    new cdk.CfnOutput(this, 'elb', {value: awsElbAddress.value});
    const hostedZone =  route53.HostedZone.fromLookup(this, 'Domain', {
      domainName: props.basedDomain
    });
    new route53.ARecord(this, 'ARecord', {
      zone: hostedZone,
      recordName: `*.eks-${name}.${props.basedDomain}.`,
      target: route53.RecordTarget.fromAlias({
        bind() {
          return {
            dnsName: awsElbAddress.value,
            hostedZoneId: 'Z31USIVHYNEOWT',
          };
        },
      }),
    });


    const primehubDomain = `hub.eks-${name}.${props.basedDomain}`; 
    const primehub = new PrimeHub(this, 'primehub', {
      eksCluster: eksCluster,
      primehubDomain: primehubDomain,
      primehubPassword: primehubPassword,
      keycloakPassword: keycloakPassword,
    });
    
    const primehubReadyHelmCharts = new cdk.ConcreteDependable();
    primehubReadyHelmCharts.add(ingressNginx);
    primehubReadyHelmCharts.add(certManager);
    primehub.node.addDependency(primehubReadyHelmCharts);

    new cdk.CfnOutput(this, 'PrimeHub URL', {value: `https://${primehubDomain}`);
    new cdk.CfnOutput(this, 'phadmin password', {value: primehubPassword});
    new cdk.CfnOutput(this, 'keycloak password', {value: keycloakPassword});
    cdk.Tags.of(eksCluster).add('owner', username);
    cdk.Tags.of(eksCluster).add('clusterType', 'dev-eks');
  }
}

const env = {
  account:  process.env.CDK_DEFAULT_ACCOUNT,
  region:   process.env.CDK_DEFAULT_REGION,
};

const app = new cdk.App();
// const eksStack = new EksFargateStack(app, 'eks-fargate-cdk', {env: env, clusterName: 'dev-eks-fargate'});
const eksStack = new EKSCluster(app, `eks-${name}`, {
  env: env, 
  clusterName: `eks-${name}`,
  basedDomain: basedDomain,
})
cdk.Tags.of(eksStack).add("owner", username);
cdk.Tags.of(eksStack).add("clusterType", 'dev-eks');

app.synth();
