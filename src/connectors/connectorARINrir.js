import Connector from "./connector";
import axios from "axios";
import fs from "fs";
import http from "http";
import ipUtils from "ip-sub";
import cliProgress from "cli-progress";
import batchPromises from "batch-promises";

export default class ConnectorARIN extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "arin-rir";
        this.cacheDir += this.connectorName + "/";
        this.statFile = "ftp://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest";
        this.cacheFile = [this.cacheDir, "arin.inetnums"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 7;

        this.httpAgent = new http.Agent({ keepAlive: true });

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

    }

    _getStatFile = () => {
        console.log(`[arin] Downloading stat file`);

        const file = this.getCacheFileName(this.statFile);

        if (fs.existsSync(file)){
            return Promise.resolve(fs.readFileSync(file, 'utf-8'));
        } else {
            return axios({
                url: this.statFile,
                method: 'GET',
                header: {
                    'User-Agent': this.userAgent
                }
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

    _createWhoisDump = (types) => {
        if (this._isCacheValid(this.cacheFile)) {
            console.log(`[arin] Using cached whois data: ${types}`);
            return Promise.resolve(JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8')));
        } else {
            return this._getStatFile()
                .then(data => {
                    const structuredData = data
                        .split("\n")
                        .filter(line => line.includes("ipv4") || line.includes("ipv6") )
                        .map(line => line.split("|"))
                        .map(([rir, cc, type, firstIpUp, hosts, date, status, hash]) => {
                            const firstIp = firstIpUp.toLowerCase();
                            return {
                                rir,
                                cc,
                                type,
                                prefix: this._toPrefix(firstIp, hosts),
                                firstIp,
                                hosts,
                                date,
                                status,
                                hash
                            };
                        })
                        .filter(i => i.rir === "arin" &&
                            ["ipv4", "ipv6"].includes(i.type) &&
                            ["allocated", "assigned"].includes(i.status));

                    return structuredData.reverse();
                })
                .then(this._toStandardFormat)
                .then(inetnums => inetnums.filter(i => !!i))
                .then(inetnums => {
                    fs.writeFileSync(this.cacheFile, JSON.stringify(inetnums));

                    return inetnums;
                });
        }
    };

    _getRdapQuery = (prefix) => {
        const url = `http://rdap.arin.net/registry/ip/${prefix}`;
        const file = this.getCacheFileName(url);

        if (this._isCacheValid(file)) {
            return Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf-8')));
        } else {
            axios.defaults.httpAgent = this.httpAgent;
            return axios({
                url,
                method: 'GET',
                timeout: 20000,
                responseType: 'json',
                header: {
                    'User-Agent': this.userAgent
                }
            })
                .then(answer => {
                    fs.writeFileSync(file, JSON.stringify(answer.data));

                    return answer.data;
                })
                .catch(error => {
                    console.log(`Cannot retrieve ${prefix}`, error.code || error.response.status);
                    return null;
                });
        }
    };

    _toStandardFormat = (items) => {
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(items.length, 0);

        const singleBatch = (items) => {
            return batchPromises(4, items, item => {
                const prefix = item.prefix;

                return this._getRdapQuery(item.firstIp)
                    .then(data => {
                        progressBar.increment();
                        if (data) {
                            const { startAddress, endAddress, remarks, events } = data;
                            const inetnum = {};

                            if (remarks) {
                                const remarksArray = remarks.map(remark => (remark.description || []));

                                const af = ipUtils.getAddressFamily(startAddress);
                                if (af === 4) {
                                    inetnum.inetnum = `${startAddress} - ${endAddress}`;
                                    inetnum.type = "inetnum";
                                } else {
                                    inetnum.inet6num = prefix;
                                    inetnum.type = "inet6num";
                                }
                                const lastChanges = (events || [])
                                    .filter(i => i.eventAction === "last changed")
                                    .pop();
                                inetnum["last-modified"] = lastChanges ? lastChanges.eventDate : null;

                                inetnum.remarks = [].concat.apply([], remarksArray);

                                for (let prop in data) {
                                    if (typeof(data[prop]) === "string" && !inetnum[prop]) {
                                        inetnum[prop] = data[prop];
                                    }
                                }

                                return inetnum;
                            }
                        }
                        return null;
                    });
            })
        }

        const halfList = Math.ceil(items.length/2);
        return Promise
            .all([
                singleBatch(items.slice(0, halfList)),
                singleBatch(items.slice(halfList))
            ])
            .then(inetnums => {
                progressBar.stop();

                return [].concat.apply([], inetnums);
            })
    };

    getObjects = (types, filterFunction, fields, forEachFunction) => {
        if (this.params.arinBulk) {
            console.log("ARIN bulk whois data not yet supported");
            return Promise.resolve([]);
        } else {
            return this._createWhoisDump(types)
                .then(data => {
                    const filtered = data.filter(i => types.includes(i.type) && filterFunction(i));
                    if (fields && fields.length) {
                        return filtered
                            .map(item => {
                                const out = {};
                                for (let k in item) {
                                    if (fields.includes(k)) {
                                        out[k] = item[k];
                                    }
                                }

                                return out;
                            });
                    } else {
                        return filtered;
                    }
                })
                .then(data => {
                    if (!!forEachFunction) {
                        for (let i of data) {
                            forEachFunction(i);
                        }

                        return [];
                    }

                    return data;
                });
        }
    }
}