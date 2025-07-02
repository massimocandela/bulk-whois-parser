import Connector from "./connector";
import fs from "fs";
import ipUtils from "ip-sub";
import cliProgress from "cli-progress";
import batchPromises from "batch-promises";
const execSync = require('child_process').execSync;
import os from "os";

import moment from 'moment/moment';

export default class ConnectorARIN extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "arin-rir";
        this.cacheDir += this.connectorName + "/";
        this.statFile = `http://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest`;
        this.cacheFile = [this.cacheDir, "arin.inetnums"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 7;
        this.daysWhoisSuballocationsCache = this.params.daysWhoisSuballocationsCache || 30;
        this.skipSuballocations = !!this.params.skipSuballocations;
        this.compileSuballocationLocally = !!this.params.compileSuballocationLocally;

        if (this.daysWhoisSuballocationsCache < 7) {
            console.log("Sub allocations in ARIN cannot be fetched more than once every 7 days. Using 7 days.");
            this.daysWhoisSuballocationsCache = 7;
        }

        if (this.daysWhoisSuballocationsCache < this.daysWhoisCache) {
            console.log(`Sub allocations in ARIN cannot be fetched more than once every ${this.daysWhoisCache} days. Using ${this.daysWhoisCache} days.`);
            this.daysWhoisSuballocationsCache = this.daysWhoisCache;
        }

        if (this.daysWhoisCache < 3) {
            console.log("NetRanges in ARIN cannot be fetched more than once every 3 days. Using 3 days.");
            this.daysWhoisCache = 3;
        }

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }

    }

    _getStatFile = () => {
        console.log(`[arin] Downloading stat file`);

        const cacheFile = `${this.cacheDir}arin-stat-file`;

        return this._downloadAndReadFile(this.statFile, cacheFile, this.daysWhoisCache, false);
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
            const v4File = [this.cacheDir, `arin-stat-file-v4.json`].join("/").replace("//", "/");
            const v6File = [this.cacheDir, `arin-stat-file-v6.json`].join("/").replace("//", "/");

            return this._addSubAllocationsByType(stats, "ipv4")
                .then(v4 => this._writeFile(v4File, v4))
                .then(v4 => {
                    return this._addSubAllocationsByType(stats, "ipv6")
                        .then(v6 => this._writeFile(v6File, v6))
                        .then(v6 => [...v4, ...v6]);
                });
        }
    }

    _getRemoteSuballocationStatFile = (type) => {

        const file = `https://geofeeds.packetvis.com/geolocatemuch/arin-stat-file-${type}.json`;
        const cacheFile = this.getCacheFileName(file);

        return this._downloadAndReadFile(file, cacheFile, this.daysWhoisCache, true)
            .then(response => {
                if (response && response.length > 8000) {
                    return response;
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
                        const ips = data.map(i => i.split(" "))
                            .filter(i => i.length >= 5)
                            .map(i => i.filter(n => ipUtils.isValidIP(n)))
                            .filter(i => i.length > 0);

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
        const file = this.getCacheFileName(`whois-prefix-${prefix}`);

        if (this._isCacheValid(file, this._getDistributedCacheTime())) {
            return this._readFile(file, true);
        } else {

            return new Promise((resolve, reject) => {
                let flag = "h"; // default for non-macOS or macOS 15+
                if (process.platform === "darwin") {
                    try {
                        // Get Darwin kernel version to determine macOS version
                        const releaseString = os.release();
                        if (typeof releaseString === "string" && releaseString.includes('.')) {
                            const versionParts = releaseString.split('.');
                            const darwinVersion = parseInt(versionParts[0]);
                            // Darwin 24+ corresponds to macOS 15+, where "s" flag is not supported
                            if (!isNaN(darwinVersion) && darwinVersion < 24) {
                                flag = "s";
                            }
                        }
                    } catch (error) {
                        // If version detection fails, fall back to "h" flag (safer default)
                        console.warn("[arin] Could not determine macOS version, using 'h' flag:", error.message);
                    }
                }
                // On macOS < 15 (darwin < 24), use "s" flag; on macOS 15+ or other platforms, use "h" flag
                const output = execSync(`whois -${flag} whois.arin.net "r > ${prefix}"`, { encoding: 'utf-8' })

                this._writeFile(file, output.split("\n")).then(resolve);

            });
        }
    }

    _compileNetRangesListLocally = () => {
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
            .then(this._addSubAllocations);
    }

    _createWhoisDump = (types) => {
        if (this._isCacheValid(this.cacheFile, 1)) {
            console.log(`[arin] Using cached whois data: ${types}`);
            return Promise.resolve(JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8')));
        } else {
            return this.getRemotePreFilteredNetRanges()
                .catch(this._compileNetRangesListLocally)
                .then(this._toStandardFormat)
                .then(inetnums => inetnums.filter(i => !!i))
                .then(inetnums => this._writeFile(this.cacheFile, inetnums))
        }
    };

    _getDistributedCacheTime = () => {
        const rndInt = Math.floor(Math.random() * parseInt(this.daysWhoisSuballocationsCache/2)) + 1;
        return Math.max(this.daysWhoisCache, this.daysWhoisSuballocationsCache - rndInt);
    }

    _getRdapQuery = (prefix) => {
        const url = `https://rdap.arin.net/registry/ip/${prefix}`;
        const file = this.getCacheFileName(url);

        return this._downloadAndReadFile(url, file, this._getDistributedCacheTime(), true)
            .catch(error => {
                console.log(`Cannot retrieve ${prefix}: ${error}`);
                return null;
            });
    };

    _toStandardFormat = (items) => {

        console.log(`[arin] Fetching NetRanges`);

        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(items.length, 0);

        const singleBatch = (items) => {
            return batchPromises(4, items, item => {
                return this._getRdapQuery(item.firstIp)
                    .then(data => {
                        progressBar.increment();
                        if (data) {
                            const { startAddress, endAddress, remarks, events } = data;
                            const inetnum = {};

                            if (remarks) {
                                const remarksArray = remarks.map(remark => (remark.description || []));
                                const cleanRemarks = remarksArray.flat().filter(i => i.toLowerCase().includes("geofeed"));

                                if (cleanRemarks?.length) {

                                    const af = ipUtils.getAddressFamily(startAddress);
                                    if (af === 4) {
                                        inetnum.inetnum = `${startAddress} - ${endAddress}`;
                                        inetnum.type = "inetnum";
                                    } else {
                                        inetnum.inet6num = item.prefix;
                                        inetnum.type = "inet6num";
                                    }
                                    const lastChanges = (events || [])
                                        .filter(i => i.eventAction === "last changed")
                                        .pop();
                                    inetnum["last-modified"] = lastChanges ? lastChanges.eventDate : null;

                                    inetnum.remarks = cleanRemarks;

                                    for (let prop in data) {
                                        if (typeof (data[prop]) === "string" && !inetnum[prop]) {
                                            inetnum[prop] = data[prop];
                                        }
                                    }

                                    return inetnum;
                                }
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

    getRemotePreFilteredNetRanges = () => {
        if (this.compileSuballocationLocally) {
            return Promise.reject("Compile locally");
        }

        const url = "https://geofeeds.packetvis.com/geolocatemuch/arin.inetnums";
        const metadataUrl = "https://geofeeds.packetvis.com/geolocatemuch/metadata.json"
        const file = this.getCacheFileName(url);
        const metadataFile = this.getCacheFileName(metadataUrl);

        return this._downloadAndReadFile(metadataUrl, metadataFile, 1, true)
            .then(metadata => {
                const lastUpdate = moment.unix(metadata.lastUpdate);
                if (moment(moment()).diff(lastUpdate, 'days') <= 10){

                    return this._downloadAndReadFile(url, file, 1, true);
                } else {
                    return Promise.reject("Remote file is too old");
                }
            })
            .then(data => {
                console.log("[arin] Using pre filtered inetnums");

                return data
                    .map(({startAddress, ipVersion, inet6num}) => {
                        return {
                            firstIp: startAddress,
                            prefix: ipVersion === "v6" ? inet6num : null
                        };
                    });
            })
    }

    getObjects = (types, filterFunction, fields, forEachFunction) => {
        if (this.params.arinBulk) {
            console.log("[arin] bulk whois data not yet supported");
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
