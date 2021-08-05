import cdk = require('@aws-cdk/core');
import * as crypto from 'crypto';

import { EKSCluster } from '../lib/eks-cluster-Stack';

const app = new cdk.App();
const env = {
  account:  process.env.CDK_DEFAULT_ACCOUNT || '',
  region:   app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION || '',
};
const username = app.node.tryGetContext('username') || process.env.USERNAME || 'dev@infuseai.io';
const name = app.node.tryGetContext('name') || process.env.NAME || 'cdk';
const primehubMode = app.node.tryGetContext('primehubMode') || process.env.PRIMEHUB_MODE || 'ee';
const basedDomain = app.node.tryGetContext('basedDomain') || process.env.AWS_BASED_DOMAIN || '';
const primehubPassword = app.node.tryGetContext('primehubPassword') || process.env.PH_PASSWORD || crypto.randomBytes(32).toString('hex');
const keycloakPassword = app.node.tryGetContext('keycloakPassword') || process.env.KC_PASSWORD || crypto.randomBytes(32).toString('hex');
const zone = app.node.tryGetContext('zone') || 'a';
const cpuInstance = app.node.tryGetContext('cpuInstance') || 't3a';
const gpuInstance = app.node.tryGetContext('gpuInstance') || 'g4dn';
const k8sInfraOnly = app.node.tryGetContext('k8sInfraOnly') || 'false';

const eksClusterStack = new EKSCluster(app, `eks-${name}-cdk-stack`, {
  env: env,
  name: name,
  username: username,
  primehubMode: primehubMode,
  basedDomain: basedDomain,
  keycloakPassword: keycloakPassword,
  primehubPassword: primehubPassword,
  availabilityZone: `${env.region}${zone}`,
  cpuInstance: cpuInstance,
  gpuInstance: gpuInstance,
  k8sInfraOnly: k8sInfraOnly
});

cdk.Tags.of(eksClusterStack).add("owner", username);
cdk.Tags.of(eksClusterStack).add("clusterType", 'dev-eks');

app.synth();
