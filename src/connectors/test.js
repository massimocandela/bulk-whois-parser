// const whois = require('whois');
//
// const options = { "server":  "whois.arin.net", "verbose": false, "follow":  8 };
// whois.lookup('n 64.58.32.0', options, function(err, data) {
//     console.log(data)
// })

const easyWhois = require('easy-whois')
easyWhois('2620:1F:4000::')
    .then(string => {
        return string.replace(/^[\s\t]*(\r\n|\n|\r)/gm, "");
    })
    .then(console.log)