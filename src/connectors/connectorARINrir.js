import Connector from "./connector";
import axios from "axios";
import fs from "fs";
import http from "http";
import ipUtils from "ip-sub";
import cliProgress from "cli-progress";
import batchPromises from "batch-promises";
import webWhois from "whois";

export default class ConnectorARIN extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "arin-rir";
        this.cacheDir += this.connectorName + "/";
        this.statFile = "ftp://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest";
        this.cacheFile = [this.cacheDir, "arin.inetnums"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 7;
        this.daysWhoisSuballocationsCache = this.params.daysWhoisSuballocationsCache || 4;
        this.skipSuballocations = !!this.params.skipSuballocations;
        this.compileSuballocationLocally = !!this.params.compileSuballocationLocally;

        if (this.daysWhoisSuballocationsCache < 7) {
            console.log("Sub allocations in ARIN cannot be fetched more than once every 7 days. Using 7 days.");
            this.daysWhoisSuballocationsCache = 7;
        }

        if (this.daysWhoisCache < 3) {
            console.log("NetRanges in ARIN cannot be fetched more than once every 3 days. Using 3 days.");
            this.daysWhoisCache = 3;
        }

        this.httpAgent = new http.Agent({ keepAlive: true });

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

    }

    _getStatFile = () => {
        console.log(`[arin] Downloading stat file`);

        const cacheFile = `${this.cacheDir}arin-stat-file`;

        const operation = () => {
            return axios({
                url: this.statFile,
                method: 'GET',
                headers: {
                    'Accept-Encoding': 'gzip',
                    'User-Agent': this.userAgent
                }
            })
                .then(response => response.data);

        }

        return this.cacheOperationOutput(operation, cacheFile, this.daysWhoisCache)
            .then(data => JSON.parse(data));
    };

    _toPrefix = (firstIp, hosts) => {
        const af = ipUtils.getAddressFamily(firstIp);
        let bits = (af === 4) ? 32 - Math.log2(hosts) : hosts;

        return `${firstIp}/${bits}`;
    };


    _addSubAllocations = (stats) => {
        if (this.skipSuballocations) {
            console.log(`[arin] Skipping sub allocations`);

            return stats;
        } else {

            return this.cacheOperationOutput(() => this._addSubAllocationsByType(stats, "ipv4"), this.cacheDir + "arin-stat-file-ipv4.json", this.daysWhoisSuballocationsCache)
                .then(v4 => {
                    return this.cacheOperationOutput(() => this._addSubAllocationsByType(stats, "ipv6"), this.cacheDir + "arin-stat-file-ipv6.json", this.daysWhoisSuballocationsCache)
                        .then(v6 => {

                            return [...JSON.parse(v4), ...JSON.parse(v6)];
                        });
                });
        }
    }

    _getRemoteSuballocationStatFile = (type) => {
        return axios({
            url: `https://geolocatemuch.com/geofeeds/arin-rir/arin-stat-file-${type}.json`,
            method: 'GET',
            headers: {
                'Accept-Encoding': 'gzip',
                'User-Agent': this.userAgent
            }
        })
            .then(response => {
                if (response.data && response.data.length) {
                    return response.data;
                } else {
                    return Promise.reject("Empty remote sub allocation file");
                }
            });
    }

    _addSubAllocationByTypeLocally = (stats, type) => {
        stats = stats.filter(i => i.type === type && i.status === "allocated");
        const out = stats;

        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(stats.length, 0);

        return batchPromises(1, stats, item => {

            return this._whois(item.prefix)
                .then(data => {

                    progressBar.increment();

                    try {
                        const ips = data
                            .map(i => i.data)
                            .flat()
                            .join("")
                            .split("\n")
                            .map(i => i.trim().split(" "))
                            .filter(i => i.length >= 5)
                            .map(i => i.filter(n => ipUtils.isValidIP(n)))
                            .filter(i => i.length === 2)

                        for (let [firstIp, lastIp] of [...new Set(ips)]) {

                            const prefixes = ipUtils.ipRangeToCidr(firstIp, lastIp);

                            for (let prefix of prefixes) {

                                out.push({
                                    rir: "arin",
                                    type,
                                    prefix,
                                    firstIp,
                                    status: "allocated"
                                });
                            }
                        }

                    } catch (error) {
                    }
                })
                .catch(console.log);

        })
            .catch(console.log)
            .then(() => {

                progressBar.stop();
                const index = {};
                for (let i of out) {
                    index[i.firstIp] = i;
                }

                return Object.values(index);
            });
    }

    _addSubAllocationsByType = (stats, type) => {
        console.log(`[arin] Fetching sub allocations ${type}`);

        if (this.compileSuballocationLocally) {

            return this._addSubAllocationByTypeLocally(stats, type);
        } else {
            return this._getRemoteSuballocationStatFile(type)
                .catch(() => {

                    console.log(`[arin] It was not possible to download precompiled sub allocations ${type}, I will try to compile them from whois instead`);

                    return this._addSubAllocationByTypeLocally(stats, type);
                });
        }
    }

    _whois = (prefix) => {
        return new Promise((resolve, reject) => {
            webWhois.lookup(`r > ${prefix}`, { follow: 0, verbose: true, timeout: 5000, returnPartialOnTimeout: true, server: "whois.arin.net" }, (error, data) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(data);
                }
            })
        });
    }

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
                                type,
                                prefix: this._toPrefix(firstIp, hosts),
                                firstIp,
                                hosts,
                                date,
                                status
                            };
                        })
                        .filter(i => i.rir === "arin" &&
                            ["ipv4", "ipv6"].includes(i.type) &&
                            ["allocated", "assigned"].includes(i.status));

                    return structuredData.reverse();
                })
                .then(this._addSubAllocations)
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
                headers: {
                    'Accept-Encoding': 'gzip',
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
        console.log(`[arin] Fetching NetRanges`);

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

                                inetnum.remarks = remarksArray.flat();

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

                return inetnums.flat();
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