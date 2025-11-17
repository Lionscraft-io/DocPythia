#!/bin/bash

# Simple deployment script for NearDocsAI
# Builds and pushes to ECR, App Runner will auto-update

set -e

# Check if AWS profile argument is provided
if [ -z "$1" ]; then
    echo "❌ Error: AWS profile is required"
    echo ""
    echo "Usage: ./deploy.sh <aws-profile> [image-tag]"
    echo ""
    echo "Available AWS profiles:"
    # Use a more reliable method to list profiles
    if [ -f ~/.aws/credentials ]; then
        grep '^\[' ~/.aws/credentials | sed 's/\[//g' | sed 's/\]//g' | sed 's/^/  - /'
    else
        echo "  - default"
    fi
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh default"
    echo "  ./deploy.sh production v1.0.0"
    echo ""
    exit 1
fi

AWS_PROFILE="$1"
export AWS_PROFILE

# Optional image tag (defaults to latest)
IMAGE_TAG="${2:-latest}"

echo "🚀 Starting NearDocsAI deployment..."
echo "📌 Using AWS Profile: $AWS_PROFILE"
echo "🏷️  Image Tag: $IMAGE_TAG"

# Verify the profile exists
if ! grep -q "^\[${AWS_PROFILE}\]" ~/.aws/credentials 2>/dev/null; then
    echo "❌ Error: AWS profile '$AWS_PROFILE' not found"
    echo ""
    echo "Available AWS profiles:"
    # Use a more reliable method to list profiles
    if [ -f ~/.aws/credentials ]; then
        grep '^\[' ~/.aws/credentials | sed 's/\[//g' | sed 's/\]//g' | sed 's/^/  - /'
    else
        echo "  - default"
    fi
    echo ""
    exit 1
fi

# Get AWS account ID and set variables
echo "🔍 Getting AWS account information..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION="${AWS_REGION:-eu-central-1}"
ECR_REPO="autodoc"

echo "📊 Deployment Configuration:"
echo "   Account ID: $ACCOUNT_ID"
echo "   Region: $AWS_REGION"
echo "   ECR Repository: $ECR_REPO"
echo ""

# Check if ECR repository exists, create if not
echo "🔍 Checking ECR repository..."
if ! aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION >/dev/null 2>&1; then
    echo "📦 Creating ECR repository..."
    aws ecr create-repository \
        --repository-name $ECR_REPO \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
    echo "✅ ECR repository created"
else
    echo "✅ ECR repository exists"
fi

# Build the Docker image
echo ""
echo "🔨 Building Docker image..."
echo "   This may take a few minutes..."
echo "   Using --no-cache to ensure fresh build with latest changes..."
docker build --no-cache -t $ECR_REPO:$IMAGE_TAG .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo "✅ Docker image built successfully"

# Login to ECR
echo ""
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

if [ $? -ne 0 ]; then
    echo "❌ ECR login failed"
    exit 1
fi

# Tag the image for ECR
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
echo ""
echo "🏷️  Tagging image for ECR..."
docker tag $ECR_REPO:$IMAGE_TAG $ECR_URI:$IMAGE_TAG

# Also tag as latest if not already
if [ "$IMAGE_TAG" != "latest" ]; then
    docker tag $ECR_REPO:$IMAGE_TAG $ECR_URI:latest
    echo "   Tagged as: $IMAGE_TAG and latest"
else
    echo "   Tagged as: latest"
fi

# Push to ECR
echo ""
echo "📤 Pushing to ECR..."
echo "   This may take a few minutes..."
docker push $ECR_URI:$IMAGE_TAG

if [ "$IMAGE_TAG" != "latest" ]; then
    docker push $ECR_URI:latest
fi

if [ $? -ne 0 ]; then
    echo "❌ Push to ECR failed"
    exit 1
fi

# Check if App Runner service exists and get its status
echo ""
echo "🔍 Checking App Runner service..."
SERVICE_ARN=$(aws apprunner list-services --region $AWS_REGION --query "ServiceSummaryList[?ServiceName=='autodoc'].ServiceArn" --output text 2>/dev/null)

if [ -n "$SERVICE_ARN" ]; then
    echo "✅ App Runner service found"
    
    # Get service URL
    SERVICE_URL=$(aws apprunner describe-service --service-arn $SERVICE_ARN --region $AWS_REGION --query "Service.ServiceUrl" --output text 2>/dev/null)
    
    echo ""
    echo "🎉 Deployment complete!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "   🕐 Deployed at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "   ✅ Image pushed: $ECR_URI:$IMAGE_TAG"
    if [ "$IMAGE_TAG" != "latest" ]; then
        echo "   ✅ Also tagged as: latest"
    fi
    echo "   🌐 App Runner will automatically update with the new image"
    echo "   🔗 Service URL: https://$SERVICE_URL"
    echo ""
    echo "💡 Note: It may take 2-3 minutes for App Runner to deploy the new version"
    echo ""
    echo "📊 Monitor deployment status:"
    echo "   aws apprunner describe-service --service-arn $SERVICE_ARN --region $AWS_REGION --query 'Service.Status'"
else
    echo "⚠️  No App Runner service found"
    echo ""
    echo "🎉 ECR push complete!"
    echo ""
    echo "📋 Deployment Summary:"
    echo "   🕐 Deployed at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "   ✅ Image pushed: $ECR_URI:$IMAGE_TAG"
    echo ""
    echo "📌 Next steps:"
    echo "   1. Create an App Runner service in the AWS Console"
    echo "   2. Select 'Amazon ECR' as the source"
    echo "   3. Use this image: $ECR_URI:$IMAGE_TAG"
    echo "   4. Configure with port 8080"
    echo "   5. Add environment variables from Secrets Manager"
    echo ""
    echo "Or create via CLI:"
    echo "   aws apprunner create-service \\"
    echo "     --service-name autodoc \\"
    echo "     --region $AWS_REGION \\"
    echo "     --source-configuration '{"
    echo "       \"ImageRepository\": {"
    echo "         \"ImageIdentifier\": \"$ECR_URI:$IMAGE_TAG\","
    echo "         \"ImageConfiguration\": {"
    echo "           \"Port\": \"8080\""
    echo "         },"
    echo "         \"ImageRepositoryType\": \"ECR\""
    echo "       },"
    echo "       \"AutoDeploymentsEnabled\": true"
    echo "     }'"
fi

# Clean up local Docker images to save space (optional)
echo ""
read -p "🧹 Clean up local Docker images? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 Cleaning up local images..."
    docker rmi $ECR_REPO:$IMAGE_TAG 2>/dev/null || true
    docker rmi $ECR_URI:$IMAGE_TAG 2>/dev/null || true
    if [ "$IMAGE_TAG" != "latest" ]; then
        docker rmi $ECR_URI:latest 2>/dev/null || true
    fi
    echo "✅ Cleanup complete"
fi

echo ""
echo "🚀 Deployment script finished!"