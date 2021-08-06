import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';

export interface AwsEfsCsiDriverProps {
  eksCluster: eks.ICluster,
  fileSystemID: string,
  username: string
}

interface HelmValues {
  [key: string]: any;
}

export class AwsEfsCsiDriver extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: AwsEfsCsiDriverProps
  ) {
    super(scope,id);

    const helmValues = {
      replicaCount: 1,
      image: {
        repository: "infuseai/aws-efs-csi-driver",
        tag: "v1.3.3-dirty",
      },
      controller: {
        tags: {
          "owner": props.username,
          "clusterName": props.eksCluster.clusterName,
        }
      },
      storageClasses: [
        {
          name: "efs-sc",
          parameters: {
            provisioningMode: "efs-ap",
            fileSystemId: props.fileSystemID,
            directoryPerms: "777",
            uid: "1000",
            gid: "100",
          }
        }
      ]
    } as HelmValues;

    props.eksCluster.addHelmChart('aws-efs-csi-driver',{
      chart: 'aws-efs-csi-driver',
      repository: 'https://kubernetes-sigs.github.io/aws-efs-csi-driver/',
      namespace: 'kube-system',
      release: 'aws-efs-csi-driver',
      values: helmValues,
      wait: true,
    })
  }
}
