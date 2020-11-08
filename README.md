# bulk-whois-parser
Bulk whois data parser

Example:

```javascript

const filterFunction = (object) => {
    // A function that returns true or false
    // Used to filter the results
}

const fields = ["inetnum", "remarks"]; // The fields you want to see in the object. Use null to get all the fields


new WhoisParser({ repos: ["ripe", "lacnic", "apnic", "afrinic"] })
    .getObjects(["inetnum", "inet6num"], filterFunction, fields)
    .then(console.log);
```
