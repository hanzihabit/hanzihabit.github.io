PUBLISH_BRANCH="publish"
DIST_DIR="dist"

npm install
npm run build
cp -r $DIST_DIR /tmp/
$CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git checkout $PUBLISH_BRANCH
rm -rf *
cp -r "/tmp/$DIST_DIR/*" .
git add *
git commit -m "Update published files"
git push origin $PUBLISH_BRANCH
git checkout $CURRENT_BRANCH