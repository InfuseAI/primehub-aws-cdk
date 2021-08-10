#! /bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
GIT_TAG=${1:-'cfTemplate'}

echo "[Release] primehub-aws-cdk ${GIT_TAG}"

echo "[Patch] Cloudformation template with tag '${GIT_TAG}'"
extension=''
if [[ "$(uname)" == "Darwin" ]]; then
  extension=".bak"
fi
sed -i${extension} "s/cfTemplate/${GIT_TAG}/g" ${DIR}/primehub-starter-cloudformation.yaml
sed -i${extension} "s/cfTemplate/${GIT_TAG}/g" ${DIR}/primehub-ce-starter-cloudformation.yaml

echo "[S3] Upload cloudformation template"
aws s3 cp ${DIR}/primehub-starter-cloudformation.yaml s3://primehub/cloudformation/${GIT_TAG}/primehub-starter-cloudformation.yaml
aws s3 cp ${DIR}/primehub-ce-starter-cloudformation.yaml s3://primehub/cloudformation/${GIT_TAG}/primehub-ce-starter-cloudformation.yaml

echo "[S3] Set cloudformation template public"
aws s3api put-object-acl --bucket primehub --key cloudformation/${GIT_TAG}/primehub-ce-starter-cloudformation.yaml --acl public-read
aws s3api put-object-acl --bucket primehub --key cloudformation/${GIT_TAG}/primehub-starter-cloudformation.yaml --acl public-read
