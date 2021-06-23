#! /user/bin/env node

import cdk = require('@aws-cdk/core');
import * as crypto from 'crypto';

import { EKSCluster } from '../lib/eks-cluster-Stack';

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

const eksClusterStack = new EKSCluster(app, `eks-${name}-cdk-stack`, {
  env: env,
  name: name,
  username: username,
  basedDomain: basedDomain,
  keycloakPassword: keycloakPassword,
  primehubPassword: primehubPassword,
});

cdk.Tags.of(eksClusterStack).add("owner", username);
cdk.Tags.of(eksClusterStack).add("clusterType", 'dev-eks');

app.synth();
