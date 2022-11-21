import * as cdk from '@aws-cdk/core';
import * as eks from '@aws-cdk/aws-eks';

export interface NvidiaDevicePluginProps {
  eksCluster: eks.ICluster;
  nodeSelector?: { [key: string]: string };
  tolerations?: { [key: string]: string }[];
}

interface HelmValues {
  [key: string]: any;
}

export class NvidiaDevicePlugin extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: NvidiaDevicePluginProps
  ) {
    super(scope, id);

    const defaultTolerations = [
      {
        key: 'CriticalAddonsOnly',
        operator: 'Exists',
      },
      {
        key: 'nvidia.com/gpu',
        operator: 'Exists',
        effect: 'NoSchedule',
      },
    ] as { [key: string]: string }[];

    const helmValues = {
      nodeSelector: props.nodeSelector,
      tolerations: defaultTolerations.concat(props.tolerations || []),
    } as HelmValues;

    props.eksCluster.addHelmChart('nvidia-device-plugin', {
      chart: 'nvidia-device-plugin',
      repository: 'https://nvidia.github.io/k8s-device-plugin',
      namespace: 'kube-system',
      release: 'nvidia-device-plugin',
      values: helmValues,
      wait: false,
      version: '0.11.0',
    });
  }
}
