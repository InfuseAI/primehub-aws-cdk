import iam = require('@aws-cdk/aws-iam');
import ec2 = require('@aws-cdk/aws-ec2');
import eks = require('@aws-cdk/aws-eks');
import cdk = require('@aws-cdk/core');
import route53 = require('@aws-cdk/aws-route53');

import { InstanceType } from '@aws-cdk/aws-ec2';
import { ClusterAutoScaler } from './cluster-autoscaler';
import { IngressNginxController } from './nginx-ingress';
import { CertManager } from './cert-manager';
import { PrimeHub } from './primehub';
import * as crypto from 'crypto';

const env = {
  account:  process.env.CDK_DEFAULT_ACCOUNT || '',
  region:   process.env.CDK_DEFAULT_REGION || '',
};

const app = new cdk.App();

const username = app.node.tryGetContext('username') || process.env.USERNAME || 'dev@infuseai.io';
const name = app.node.tryGetContext('name') || process.env.NAME || 'cdk';
const basedDomain = app.node.tryGetContext('basedDomain') || process.env.AWS_BASED_DOMAIN || 'aws.primehub.io';
const primehubPassword = app.node.tryGetContext('primehubPassword') || process.env.PH_PASSWORD || crypto.randomBytes(32).toString('hex');
const keycloakPassword = app.node.tryGetContext('keycloakPassword') || process.env.KC_PASSWORD || crypto.randomBytes(32).toString('hex');

export interface EksStackProps extends cdk.StackProps {
  clusterName?:  string;
  basedDomain:  string;
  masterRole?:  string;
}

export class EKSCluster extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: EksStackProps) {
    super(scope, id, props);
    let masterRole;

    const clusterName = `eks-${name}`;

    const vpc = new ec2.Vpc(this, 'vpc', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
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
        roleName: `${clusterName}-master-role`,
        assumedBy: new iam.AnyPrincipal(),
      });
    }


    const eksCluster = new eks.Cluster(this, 'Cluster', {
      version: eks.KubernetesVersion.V1_20,
      mastersRole: masterRole,
      clusterName: clusterName,
      outputClusterName: true,

      // Networking related settings listed below - important in enterprise context.
      endpointAccess: eks.EndpointAccess.PUBLIC, // In Enterprise context, you may want to set it to PRIVATE.
      vpc: vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PUBLIC}], // you can also specify the subnets by other attributes 
      defaultCapacity: 0,
    });

    const defaultNodeGroup = eksCluster.addNodegroupCapacity('Default-Node-Group',{
      nodegroupName: "default-node-group",
      desiredSize: 1,
      minSize: 1,
      maxSize: 3,
      instanceTypes: [new InstanceType('t3a.xlarge')],
      subnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      tags: {
        Name: `${clusterName}-default-node-group`,
        cluster: clusterName,
        owner: username,
        clusterType: "dev-eks"
      },
    });

    // const scaledCpuPool = eksCluster.addNodegroupCapacity('Scaled-Cpu-Pool', {
    //   nodegroupName: 'scaled-cpu-pool',
    //   desiredSize: 0,
    //   minSize: 0,
    //   maxSize: 2,
    //   instanceTypes: [new InstanceType('t3a.xlarge')],
    //   subnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
    //   tags: {
    //     Name: `${clusterName}-scaled-cpu-pool`,
    //     cluster: clusterName,
    //     owner: username,
    //     clusterType: "dev-eks",
    //     [`k8s.io/cluster-autoscaler/${clusterName}`]: 'onwed',
    //     'k8s.io/cluster-autoscaler/enabled': 'TRUE',
    //     'k8s.io/cluster-autoscaler/node-template/label/auto-scaler': 'enabled',
    //     'k8s.io/cluster-autoscaler/node-template/label/component': 'singleuser-server',
    //     'k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose': 'user',
    //     'k8s.io/cluster-autoscaler/node-template/taint/hub.jupyter.org/dedicated': 'user:NoSchedule'
    //   },
    //   labels: {
    //     'auto-scaler': 'enabled',
    //     'component': 'singleuser-server',
    //     'hub.jupyter.org/node-purpose': 'user'
    //   },
    // });

    // const asg = new AutoScalingGroup(this, 'OnDemandASG', {
    //   autoScalingGroupName: `${clusterName}-scaled-cpu-pool`,
    //   desiredCapacity: 0,
    //   minCapacity: 0,
    //   maxCapacity: 2,
    //   instanceType: new InstanceType('t3a.xlarge'),
    //   vpc: vpc,
    //   vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
    //   machineImage: new eks.EksOptimizedImage()
    // });
    // eksCluster.connectAutoScalingGroupCapacity(asg, {});

    const cpuASG = eksCluster.addAutoScalingGroupCapacity('OnDemandCpuASG', {
      autoScalingGroupName: `${clusterName}-scaled-cpu-pool`,
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 2,
      instanceType: new InstanceType('t3a.xlarge'),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component='singleuser-server',hub.jupyter.org/node-purpose='user' --register-with-taints='hub.jupyter.org/dedicated=user:NoSchedule'",
      },
    });
    cdk.Tags.of(cpuASG).add('Name', `${clusterName}-scaled-cpu-pool`);
    cdk.Tags.of(cpuASG).add('cluster', clusterName); 
    cdk.Tags.of(cpuASG).add('owner', username);
    cdk.Tags.of(cpuASG).add('clusterType', 'dev-eks');
    cdk.Tags.of(cpuASG).add(`k8s.io/cluster-autoscaler/${clusterName}`, 'owned');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/enabled', 'TRUE');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/auto-scaler', 'enabled');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/component', 'singleuser-server');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose', 'user');
    cdk.Tags.of(cpuASG).add('k8s.io/cluster-autoscaler/node-template/taint/hub.jupyter.org/dedicated', 'user:NoSchedule');

    const gpuASG = eksCluster.addAutoScalingGroupCapacity('OnDemandGpuASG', {
      autoScalingGroupName: `${clusterName}-scaled-gpu-pool`,
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 2,
      instanceType: new InstanceType('g4dn.xlarge'),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: ['ap-northeast-1a']},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component='singleuser-server',hub.jupyter.org/node-purpose='user' --register-with-taints='nvidia.com/gpu=true:NoSchedule'",
        dockerConfigJson: '{ "exec-opts": ["native.cgroupdriver=systemd"] }',
      },
    });
    cdk.Tags.of(gpuASG).add('Name', `${clusterName}-scaled-gpu-pool`);
    cdk.Tags.of(gpuASG).add('cluster', clusterName); 
    cdk.Tags.of(gpuASG).add('owner', username);
    cdk.Tags.of(gpuASG).add('clusterType', 'dev-eks');
    cdk.Tags.of(gpuASG).add(`k8s.io/cluster-autoscaler/${clusterName}`, 'owned');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/enabled', 'TRUE');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/auto-scaler', 'enabled');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/component', 'singleuser-server');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose', 'user');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/taint/nvidia.com/gpu', 'true:NoSchedule');

    // Auto Scale
    const autoscalerStmt = new iam.PolicyStatement();
    autoscalerStmt.addResources("*");
    autoscalerStmt.addActions(
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:DescribeLaunchConfigurations",
      "autoscaling:DescribeTags",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:TerminateInstanceInAutoScalingGroup",
      "ec2:DescribeLaunchTemplateVersions"
    );
    const autoscalerPolicy = new iam.Policy(this, "cluster-autoscaler-policy", {
      policyName: "ClusterAutoscalerPolicy",
      statements: [autoscalerStmt],
    });
    autoscalerPolicy.attachToRole(defaultNodeGroup.role);
    autoscalerPolicy.attachToRole(cpuASG.role);
    autoscalerPolicy.attachToRole(gpuASG.role);

    new ClusterAutoScaler(this, 'cluster-autoscaler', {
      eksCluster: eksCluster,
      version: 'v1.21.0'
    })

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
      recordName: `*.${clusterName}.${props.basedDomain}.`,
      target: route53.RecordTarget.fromAlias({
        bind() {
          return {
            dnsName: awsElbAddress.value,
            hostedZoneId: 'Z31USIVHYNEOWT',
          };
        },
      }),
    });


    const primehubDomain = `hub.${clusterName}.${props.basedDomain}`; 
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

    new cdk.CfnOutput(this, 'PrimeHub URL', {value: `https://${primehubDomain}`});
    new cdk.CfnOutput(this, 'phadmin password', {value: primehubPassword});
    new cdk.CfnOutput(this, 'keycloak password', {value: keycloakPassword});
    cdk.Tags.of(eksCluster).add('owner', username);
    cdk.Tags.of(eksCluster).add('clusterType', 'dev-eks');
  }
}

const eksStack = new EKSCluster(app, `eks-${name}-cdk-stack`, {
  env: env, 
  basedDomain: basedDomain,
});

cdk.Tags.of(eksStack).add("owner", username);
cdk.Tags.of(eksStack).add("clusterType", 'dev-eks');

app.synth();
