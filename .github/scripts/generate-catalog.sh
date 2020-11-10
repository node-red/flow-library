echo "Generating catalogue"
node ./flow-library/tasks/generate_catalog.js > ./catalogue.nodered.org/catalogue.json.new
if [ $? -ne 0 ]; then
   exit
fi

node ./flow-library/.github/scripts/compare-catalogs.js
if [ $? -ne 0 ]; then
    echo "Nothing to do"
   exit
fi

echo "Updating catalogue"
cd catalogue.nodered.org
mv catalogue.json.new catalogue.json
echo "Node-RED community node module catalogue" > index.html
echo "Updated: " >> index.html
date >> index.html
git config --global user.name "node-red-flow-library"
git config --global user.email "node-red-flow-library@users.noreply.github.com"
git add catalogue.json index.html
git commit -m "Update catalogue"
git push origin master