PUBLISH_BRANCH="publish"
DIST_DIR="./dist"

npm install
npm run build
cp vocabularies.json dist/vocabularies.json
cp locales.json dist/locales.json
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git checkout $PUBLISH_BRANCH
mv dist/vocabularies.json vocabularies.json
mv dist/locales.json locales.json
rm -rf assets
rm index.html
mv $DIST_DIR/* .
git add assets
git add vocabularies
git add index.html
git commit -m "Update published files"
git push origin $PUBLISH_BRANCH
rm -rf dist
rm -rf node_modules
git checkout $CURRENT_BRANCH