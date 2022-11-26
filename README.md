# Node-RED Library

This is the source of the application behind <http://flows.nodered.org>.

It provides a searchable index of user-contributed flows as well as node packages
published to npm.

## Running a development copy

This repo comes with a docker-compose based development environment. To get started:

1. Install docker

2. Configure your flow-library settings.

   The repository includes the file `default-settings.js`. You should copy that
   to `settings.js` and update it with your various api keys.
   **Do not** check this file back into git - it has already been added to `.gitignore` to prevent this.

3. Run:

        npm run docker

   This first time you run this will take a while as it downloads various pieces.
   When it completes, you will be able to access http://localhost:8080 to see
   the flow library.

The docker image uses `nodemon` to watch for changes to the source code and
automatically restart the app when needed - without having to restart docker.

## Add nodes

To test you will want to add a few nodes to the database.  To do so, use the update-one task.  For example.

    node tasks/update-one.js node-red-dashboard

or in the docker container running the application

    docker exec -it flow-library_node_1 node tasks/update-one.js node-red-dashboard

## Configuration

The following env vars are used to configure the app.

```
PORT
NR_GITHUB_CLIENTID
NR_GITHUB_SECRET
NR_GITHUB_CALLBACK
NR_GITHUB_ACCESSTOKEN
NR_MONGO_URL
NR_SESSION_KEY
NR_SESSION_SECRET
NR_ADMINS
NR_TWITTER_CONSUMER_KEY
NR_TWITTER_CONSUMER_SECRET
NR_TWITTER_ACCESS_TOKEN_KEY
NR_TWITTER_ACCESS_TOKEN_SECRET
NR_MASTODON_URL
NR_MASTODON_TOKEN
NR_SLACK_WEBHOOK
NR_MODULE_BLOCKLIST
NR_AWS_BUCKET
NR_AWS_ACCESS_KEY_ID
NR_AWS_SECRET_ACCESS_KEY
NR_AWS_REGION
```
