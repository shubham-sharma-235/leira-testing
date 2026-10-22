#!/usr/bin/env bash
# Upload site assets from public/ to S3 under static/, served via CloudFront at
#   https://media.leiraindia.com/static/<same path as public/>
#
# Run from the frontend root on the EC2 box (instance role needs s3:PutObject):
#   bash scripts/upload-static-to-s3.sh
#
# Uses `cp --recursive` (not `sync`) so s3:ListBucket is not required.
set -euo pipefail

BUCKET="${AWS_S3_BUCKET:-leiraindia-media-prod}"
PREFIX="${STATIC_PREFIX:-static}"
CDN_URL="${STATIC_CDN_URL:-https://media.leiraindia.com/static}"
REGION="${AWS_REGION:-ap-south-1}"
CACHE_CONTROL="${STATIC_CACHE_CONTROL:-public, max-age=604800}"

cd "$(dirname "$0")/.."

if [ ! -d public ]; then
  echo "public/ not found — run this from the frontend repo." >&2
  exit 1
fi

echo "Uploading public/ -> s3://${BUCKET}/${PREFIX}/"
aws s3 cp public "s3://${BUCKET}/${PREFIX}/" \
  --recursive \
  --region "${REGION}" \
  --cache-control "${CACHE_CONTROL}" \
  --exclude "*.html" \
  --exclude "*.svg" \
  --exclude ".DS_Store"

echo
echo "Checking a few files on CloudFront..."
fail=0
for path in \
  "/images/logo.png" \
  "/graphics/g1.png" \
  "/bandesk.png" \
  "/images/how-to-use-s3.JPG" \
  "/videos/product-showcase.mp4" \
  "/Summer%20Banner%20Phone.png"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -I "${CDN_URL}${path}")"
  echo "  ${code}  ${CDN_URL}${path}"
  [ "${code}" = "200" ] || fail=1
done

if [ "${fail}" -ne 0 ]; then
  echo "Some files are not reachable on CloudFront yet — do NOT enable NEXT_PUBLIC_STATIC_ASSETS_URL." >&2
  exit 1
fi

echo
echo "All good. Now set NEXT_PUBLIC_STATIC_ASSETS_URL=${CDN_URL} and rebuild the frontend."
