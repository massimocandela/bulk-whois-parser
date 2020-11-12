import Connector from "./connector";
import axios from "axios";
import fs from "fs";
import whois from "easy-whois";
import moment from "moment";
import https from "https";
import ipUtils from "ip-sub";
import cliProgress from "cli-progress";
import batchPromises from "batch-promises";


export default class ConnectorARINrir extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "arin-rir";
        this.cacheDir += this.connectorName + "/";
        this.statFile = "ftp://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest";
        this.cacheFile = [this.cacheDir, "arin.inetnums"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 7;

        this.httpsAgent = new https.Agent({ keepAlive: true });

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

        fs.writeFileSync(this.cacheFile, "");

        this.useWhois = false;

        this.internalNames = {
            inetnum: "ipv4",
            inet6num: "ipv6",
            "aut-num": "asn"
        };

    }

    _getStatFile = () => {
        console.log(`Downloading stat file from ARIN`);

        const file = this.getCacheFileName(this.statFile);

        if (fs.existsSync(file)){
            return Promise.resolve(fs.readFileSync(file, 'utf-8'));
        } else {
            return axios({
                url: this.statFile,
                method: 'GET',
            })
                .then(response => {

                    fs.writeFileSync(file, response.data);
                    return response.data;
                });
        }
    };

    _toPrefix = (firstIp, hosts) => {
        const af = ipUtils.getAddressFamily(firstIp);
        let bits = (af === 4) ? 32 - Math.log2(hosts) : hosts;

        return `${firstIp}/${bits}`;
    };

    //arin|CA|asn|3359|1|19931222|assigned|b4a713891cb3a82356be54de1e2cb649
    _getAsn = (data) => {
        return data
            .split("\n")
            .filter(line => line.includes("|asn|"))
            .map(line => line.split("|"))
            .map(bits => {
                return {
                    type: "asn",
                    rir: bits[0],
                    asn: bits[3],
                    status: bits[6]
                };
            })
            .filter(i => i.rir === "arin" &&
                ["allocated", "assigned"].includes(i.status));
    };

    _getInetnums = (data, type) => {
        return data
            .split("\n")
            .filter(line => line.includes(type))
            .map(line => line.split("|"))
            .map(([rir, cc, type, firstIp, hosts, date, status, hash]) => {
                return {
                    rir,
                    cc,
                    type,
                    firstIp,
                    // hosts,
                    date,
                    status
                };
            })
            .filter(i => i.rir === "arin" &&
                i.type === type &&
                ["allocated", "assigned"].includes(i.status));
    };

    _createWhoisDump = (type) => {

        // if (this._isCacheValid()) {
        //     console.log("Using ARIN cached whois data");
        //     return Promise.resolve(this.cacheFile);
        // } else {
        return this._getStatFile()
            .then(data => {
                let out = [];

                switch(type) {
                    case "ipv4":
                        out = this._getInetnums(data, type);
                        break;
                    case "ipv6":
                        out = this._getInetnums(data, type);
                        break;
                    case "asn":
                        out = this._getAsn(data);
                }

                return out.reverse();
            })
            .then(this._transformToStandardFormat);
        // }
    };

    _getWhoisQuery = (handle) => {
        return whois(handle)
            .then(string => {
                return string.replace(/^[\s\t]*(\r\n|\n|\r)/gm, "");
            });
    };

    _getRdapQuery = (object) => {
        const type = object.type;
        const handle = (type === "asn") ? object.asn : object.firstIp;
        const url = (type === "asn") ?
            `https://rdap.arin.net/registry/autnum/${handle}` :
            `https://rdap.arin.net/registry/ip/${handle}`;
        const file = this.getCacheFileName(url);

        const getRemarks = (remarks) => {
            let out = "";
            for (let {title, description} of remarks) {
                for (let item of description) {
                    out += `remarks: ${item}\n`;
                }
            }

            return out + "\n";
        };

        if (fs.existsSync(file)) {
            return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf-8')));
        } else {
            axios.defaults.httpsAgent = this.httpsAgent;
            return axios({
                url,
                method: 'GET',
                timeout: 20000,
                responseType: 'json'
            })
                .then(answer => {
                    fs.writeFileSync(file, JSON.stringify(answer.data));
                    let out = "";

                    if (answer.data.ipVersion === "v4") {
                        out += `inetnum: ${answer.data.startAddress} - ${answer.data.endAddress}`;
                    } else {
                        out += `inet6num: ${answer.data.startAddress} - ${answer.data.endAddress}`;
                    }

                    for (let key in answer.data) {
                        const item = answer.data[key];
                        if (key === "remarks") {
                            out += getRemarks(item);
                        } else if (typeof(item) === "string") {
                            out += `${key}: ${item}\n`;
                        }
                    }

                    return out + "\n";
                })
                .catch(error => {
                    console.log(`Cannot retrieve ${handle}`, error.code || error.response.status);
                    return null;
                });
        }
    };

    _getQuery = (object) => {
        if (this.useWhois && object.firstIp) {
            return this._getWhoisQuery(object.firstIp);
        } else {
            return this._getRdapQuery(object);
        }
    };

    _transformToStandardFormat = (items) => {

        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(items.length, 0);

        const singleBatch = (items) => {
            return batchPromises(4, items, item => {

                return this._getQuery(item)
                    .then(data => {
                        progressBar.increment();
                        fs.appendFileSync(this.cacheFile, "\n" + data);
                    });
            })
        }

        const halfList = Math.ceil(items.length/2);
        return Promise
            .all([
                singleBatch(items.slice(0, halfList)),
                singleBatch(items.slice(halfList, items.length))
            ])
            .then(() => {
                progressBar.stop();

                return this.cacheFile;
            })
    };

    _isCacheValid = () => {
        if (fs.existsSync(this.cacheFile)) {
            const stats = fs.statSync(this.cacheFile);
            const lastDownloaded = moment(stats.mtime);

            if (moment(lastDownloaded).diff(moment(), 'days') <= this.daysWhoisCache){
                return true;
            }
        }

        return false;
    };

    getObjects = (types, filterFunction, fields) => {
        if (this.params.arinBulk) {
            console.log("ARIN bulk whois data not yet supported");
            return Promise.resolve([]);
        } else {
            return batchPromises(1, types, type => {
                return this._createWhoisDump(this.internalNames[type]);
            })
                .then(() => {
                    return Promise.all(types.map(type => this._readLines(this.cacheFile, type, filterFunction, fields)))
                        .then(objects => {
                            return [].concat.apply([], objects);
                        });
                })

        }
    }
}