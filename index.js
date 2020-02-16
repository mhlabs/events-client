const clientLib = require("./src/events-client");
const client = new clientLib.Client("events", "test");
async function run() {
  var response = await client.send("test", { old: { test: 1, list:[1,2,3] }, new: { test: 3, list:[1,2,3] } ,  
  });
  console.log(response);
}

run();