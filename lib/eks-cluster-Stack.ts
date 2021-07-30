import iam = require('@aws-cdk/aws-iam');
import ec2 = require('@aws-cdk/aws-ec2');
import efs = require('@aws-cdk/aws-efs');
import eks = require('@aws-cdk/aws-eks');
import cdk = require('@aws-cdk/core');
import route53 = require('@aws-cdk/aws-route53');

import { InstanceType } from '@aws-cdk/aws-ec2';
import { ClusterAutoScaler } from './cluster-autoscaler';
import { IngressNginxController } from './nginx-ingress';
import { CertManager } from './cert-manager';
import { PrimeHub } from './primehub';
import { NvidiaDevicePlugin } from './nvidia-device-plugin';
import { AwsEfsCsiDriver } from './aws-efs-csi-driver';

export interface EksStackProps extends cdk.StackProps {
  name:  string;
  username: string;
  primehubMode: string;
  basedDomain:  string;
  primehubPassword: string;
  keycloakPassword: string;
  availabilityZone: string;
  cpuInstance: string;
  gpuInstance: string;
  masterRole?:  string;
}

export class EKSCluster extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: EksStackProps) {
    super(scope, id, props);
    let masterRole;
    let primehubDomain;
    const env: cdk.Environment = props.env || {};
    const account: string  = env.account || '';
    const region: string = env.region || '';
    const clusterName = `eks-${props.name}`;

    const vpc = new ec2.Vpc(this, 'vpc', {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
    });  // Create a new VPC for our cluster

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
      instanceTypes: [new InstanceType(`${props.cpuInstance}.xlarge`)],
      subnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: [props.availabilityZone]},
      tags: {
        Name: `${clusterName}-default-node-group`,
        cluster: clusterName,
        owner: props.username,
        clusterType: "dev-eks"
      },
    });

    const cpuASG = eksCluster.addAutoScalingGroupCapacity('OnDemandCpuASG', {
      autoScalingGroupName: `${clusterName}-scaled-cpu-pool`,
      desiredCapacity: 0,
      minCapacity: 0,
      maxCapacity: 2,
      instanceType: new InstanceType(`${props.cpuInstance}.xlarge`),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: [props.availabilityZone]},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component=singleuser-server,hub.jupyter.org/node-purpose=user --register-with-taints=hub.jupyter.org/dedicated=user:NoSchedule",
      },
    });
    cdk.Tags.of(cpuASG).add('Name', `${clusterName}-scaled-cpu-pool`);
    cdk.Tags.of(cpuASG).add('cluster', clusterName);
    cdk.Tags.of(cpuASG).add('owner', props.username);
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
      instanceType: new InstanceType(`${props.gpuInstance}.xlarge`),
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: [props.availabilityZone]},
      bootstrapOptions: {
        kubeletExtraArgs: "--node-labels=component=singleuser-server,hub.jupyter.org/node-purpose=user,nvidia.com/gpu=true --register-with-taints=nvidia.com/gpu=true:NoSchedule",
        dockerConfigJson: '{ "exec-opts": ["native.cgroupdriver=systemd"] }',
      },
    });
    cdk.Tags.of(gpuASG).add('Name', `${clusterName}-scaled-gpu-pool`);
    cdk.Tags.of(gpuASG).add('cluster', clusterName);
    cdk.Tags.of(gpuASG).add('owner', props.username);
    cdk.Tags.of(gpuASG).add('clusterType', 'dev-eks');
    cdk.Tags.of(gpuASG).add(`k8s.io/cluster-autoscaler/${clusterName}`, 'owned');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/enabled', 'TRUE');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/auto-scaler', 'enabled');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/component', 'singleuser-server');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/label/hub.jupyter.org/node-purpose', 'user');
    cdk.Tags.of(gpuASG).add('k8s.io/cluster-autoscaler/node-template/taint/nvidia.com/gpu', 'true:NoSchedule');

    // Nvidia device Plugin
    new NvidiaDevicePlugin(this, 'NvidiaDevicePlugin', {
      eksCluster: eksCluster,
      nodeSelector: { 'nvidia.com/gpu': 'true' },
      tolerations: [{ operator: 'Exists', effect: 'NoSchedule' }],
    });

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
    });

    // AWS ECR
    const ecrStamt = new iam.PolicyStatement();
    ecrStamt.addResources("*");
    ecrStamt.addActions(
      "ecr:*",
      "sts:GetServiceBearerToken"
    );
    const ecrPolicy = new iam.Policy(this, "ecr-full-access-policy", {
      policyName: "ECRFullAccessPolicy",
      statements: [ecrStamt],
    });
    ecrPolicy.attachToRole(defaultNodeGroup.role);
    ecrPolicy.attachToRole(cpuASG.role);
    ecrPolicy.attachToRole(gpuASG.role);
    eksCluster.addHelmChart('aws-ecr-credential', {
      chart: "aws-ecr-credential",
      release: "aws-ecr-credential",
      repository: 'https://charts.infuseai.io',
      createNamespace: true,
      namespace: 'hub',
      values: {
        aws: {
          account: account,
          region: region,
        },
        targetNamespace: 'hub'
      },
      wait: false,
    });

    // AWS EFS
    const efsFileSystem = new efs.FileSystem(this, 'efs-file-system', {
      fileSystemName: `efs-${clusterName}`,
      vpc: vpc,
      vpcSubnets: {subnetType: ec2.SubnetType.PUBLIC, availabilityZones: [props.availabilityZone]},
      securityGroup: eksCluster.clusterSecurityGroup,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const efsPolicy = new iam.Policy(this, 'efs-full-access-policy', {
      policyName: "EFSFullAccessPolicy",
      statements: [
        new iam.PolicyStatement({
          resources: ["*"],
          effect: iam.Effect.ALLOW,
          actions: [
            "elasticfilesystem:DescribeAccessPoints",
            "elasticfilesystem:DescribeFileSystems",
            "elasticfilesystem:Client*"
          ]
        }),
        new iam.PolicyStatement({
          resources: ["*"],
          effect: iam.Effect.ALLOW,
          actions: [
            "elasticfilesystem:CreateAccessPoint"
          ],
          conditions: {
            "StringLike": {
              "aws:RequestTag/efs.csi.aws.com/cluster": "true"
            }
          }
        }),
        new iam.PolicyStatement({
          resources: ["*"],
          effect: iam.Effect.ALLOW,
          actions: [
            "elasticfilesystem:DeleteAccessPoint"
          ],
          conditions: {
            "StringLike": {
              "aws:RequestTag/efs.csi.aws.com/cluster": "true"
            }
          }
        }),
      ]
    });
    efsPolicy.attachToRole(defaultNodeGroup.role);
    efsPolicy.attachToRole(cpuASG.role);
    efsPolicy.attachToRole(gpuASG.role);
    const csiDriver = new AwsEfsCsiDriver(this, 'aws-efs-csi-driver', {
      eksCluster: eksCluster,
      fileSystemID: efsFileSystem.fileSystemId,
      username: props.username
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
    new cdk.CfnOutput(this, 'AWS ELB Domain', {value: awsElbAddress.value});

    if (props.basedDomain != '') {
      // Setup DNS record by AWS ELB
      const hostedZone =  route53.HostedZone.fromLookup(this, 'Domain', {
        domainName: props.basedDomain
      });

      let hostedZoneID = EKSCluster.getELBHostedZoneID(region);

      new route53.ARecord(this, 'ARecord', {
        zone: hostedZone,
        recordName: `*.${clusterName}.${props.basedDomain}.`,
        target: route53.RecordTarget.fromAlias({
          bind() {
            return {
              dnsName: awsElbAddress.value,
              hostedZoneId: hostedZoneID,
            };
          },
        }),
      });
      primehubDomain = `hub.${clusterName}.${props.basedDomain}`;
    } else {
      primehubDomain = awsElbAddress.value;
    }

    const primehub = new PrimeHub(this, 'primehub', {
      eksCluster: eksCluster,
      clusterName: clusterName,
      primehubMode: 'ee',
      primehubDomain: primehubDomain,
      primehubPassword: props.primehubPassword,
      keycloakPassword: props.keycloakPassword,
      account: account,
      region: region,
      sharedVolumeStorageClass: 'efs-sc'
    });

    const primehubReadyHelmCharts = new cdk.ConcreteDependable();
    primehubReadyHelmCharts.add(ingressNginx);
    primehubReadyHelmCharts.add(certManager);
    primehubReadyHelmCharts.add(csiDriver);
    primehub.node.addDependency(primehubReadyHelmCharts);

    new cdk.CfnOutput(this, 'PrimeHub URL', {value: `https://${primehubDomain}`});
    new cdk.CfnOutput(this, 'PrimeHub Account', {value: 'phadmin'});
    new cdk.CfnOutput(this, 'PrimeHub Password', {value: props.primehubPassword});
    new cdk.CfnOutput(this, 'Keycloak Account', {value: 'keycloak'});
    new cdk.CfnOutput(this, 'Keycloak Password', {value: props.keycloakPassword});

    cdk.Tags.of(eksCluster).add('owner', props.username);
    cdk.Tags.of(eksCluster).add('clusterName', clusterName);
    cdk.Tags.of(eksCluster).add('clusterType', 'dev-eks');
  }

  static getELBHostedZoneID(region: string): string {
    interface RegionMap {
      [name: string]: string
    }

    const nlbServiceEndpoints: RegionMap = {
      "us-east-2":      "ZLMOA37VPKANP",
      "us-east-1":      "Z26RNL4JYFTOTI",
      "us-west-1":      "Z24FKFUX50B4VW",
      "us-west-2":      "Z18D5FSROUN65G",
      "af-south-1":     "Z203XCE67M25HM",
      "ap-east-1":      "Z12Y7K3UBGUAD1",
      "ap-south-1":     "ZVDDRBQ08TROA",
      "ap-northeast-3": "Z1GWIQ4HH19I5X",
      "ap-northeast-2": "ZIBE1TIR4HY56",
      "ap-southeast-1": "ZKVM4W9LS7TM",
      "ap-southeast-2": "ZCT6FZBF4DROD",
      "ap-northeast-1": "Z31USIVHYNEOWT",
      "ca-central-1":   "Z2EPGBW3API2WT",
      "cn-north-1":     "Z3QFB96KMJ7ED6",
      "cn-northwest-1": "ZQEIKTCZ8352D",
      "eu-central-1":   "Z3F0SRJ5LGBH90",
      "eu-west-1":      "Z2IFOLAFXWLO4F",
      "eu-west-2":      "ZD4D7Y8KGAS4G",
      "eu-south-1":     "Z23146JA1KNAFP",
      "eu-west-3":      "Z1CMS0P5QUZ6D5",
      "eu-north-1":     "Z1UDT6IFJ4EJM",
      "me-south-1":     "Z3QSRYVP46NYYV",
      "sa-east-1":      "ZTK26PT1VY4CU",
      "us-gov-east-1":  "Z1ZSMQQ6Q24QQ8",
      "us-gov-west-1":  "ZMG1MZ2THAWF1",
    }

    return nlbServiceEndpoints[region] || '';
  }
}
