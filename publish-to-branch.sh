PUBLISH_BRANCH="publish"
DIST_DIR="./dist"

npm install
npm run build
$CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git checkout $PUBLISH_BRANCH
rm -rf assets
mv $DIST_DIR/* .
git add assets
git add index.html
git commit -m "Update published files"
git push origin $PUBLISH_BRANCH
git checkout $CURRENT_BRANCH