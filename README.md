# bulk-whois-parser
Bulk whois data parser.
It automatically downloads and caches bulk whois data.
It parses and filters the data, and returns it in JavaScript objects. It also removes some format differences across the various whois servers.

Install:

```bash
npm install bulk-whois-parser
```

Import:

```js
import WhoisParser from "bulk-whois-parser";
```


Usage example:

```javascript

const filterFunction = (object) => {
    // A function that returns true or false, used to filter the results
    // Make this function as selective as possible, since che amount of whois data
    // can be overwhelming.
}

// The fields you want to see in the object. Use null to get all the fields
const fields = ["inetnum", "inet6num", "remarks"]; 


new WhoisParser({ repos: ["ripe", "lacnic", "apnic", "afrinic", "arin"] })
    .getObjects(["inetnum", "inet6num"], filterFunction, fields)
    .then(objects => {
        // Do something with the objects (array)
    });
```

> You don't have to pass any file or anything, the library will automatically download the data.

Result example:

```js
[
  {
    inet6num: '2001:67c:370::/48',
    netname: 'ietf-ipv6-meeting-network',
    country: 'CH',
    org: 'ORG-IS136-RIPE',
    'admin-c': 'DUMY-RIPE',
    'tech-c': 'DUMY-RIPE',
    status: 'ASSIGNED PI',
    notify: 'ripedb-updates@noc.ietf.org',
    'mnt-by': [ 'RIPE-NCC-END-MNT', 'IETF-MNT', 'netnod-mnt' ],
    'mnt-routes': 'IETF-MNT',
    'mnt-domains': 'ietf-MNT',
    created: '2010-11-18T17:16:42Z',
    'last-modified': '2020-09-14T13:46:23Z',
    source: 'RIPE',
    'sponsoring-org': 'ORG-NIE1-RIPE',
    remarks: [
      'Geofeed https://noc.ietf.org/geo/google.csv',
      '****************************',
      '* THIS OBJECT IS MODIFIED',
      '* Please note that all data that is generally regarded as personal',
      '* data has been removed from this object.',
      '* To view the original object, please query the RIPE Database at:',
      '* http://www.ripe.net/whois',
      '****************************'
    ]
  },
  ...
]
```

Enjoy!
