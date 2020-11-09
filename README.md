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


This is an example of result

```json
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
