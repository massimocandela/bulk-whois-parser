import md5 from "md5";
import fs from "fs";
import readline from "readline";
import zlib from "zlib";
import moment from "moment";
const urlParser = require('url');
const https = require('https');
const http = require('http');

const agentOptions = {
    family: 4,
    keepAlive: true,
    maxSockets: 240,
    keepAliveMsecs: 50000000,
    maxFreeSockets: 256,
    rejectUnauthorized: false
};

const proto = {
    https: {
        fetch: https,
        agent: new https.Agent(agentOptions)
    },
    http: {
        fetch: http,
        agent: new http.Agent(agentOptions)
    },
}

export default class Connector {
    constructor(params) {
        this.params = params || {};
        this.userAgent = this.params.userAgent || "bulk-whois-parser";
        this.connectorName = "connector";
        this.cacheDir = this.params.cacheDir || ".cache/";
        this.cacheFile = null;
        this.dumpUrl = null;
        this.daysWhoisCache = this.params.defaultCacheDays || 1;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }

    _readLines = (compressedFile, type, filterFunction, fields = [], forEachFunction=null) => {
        return new Promise((resolve, reject) => {

            if (!filterFunction) {
                reject(new Error("You MUST specify a filter function"));
            }

            let lastObject = null;
            const objects = [];

            let lineReader = readline.createInterface({
                input: fs.createReadStream(compressedFile)
                    .pipe(zlib.createGunzip())
                    .on("error", (error) => {
                        console.log(error);
                        console.log(`ERROR: Delete the cache file ${compressedFile}`);
                    })
            });

            lineReader
                .on('line', (line) => {
                    if (!lastObject && line.startsWith(type + ":")) { // new object
                        const [key, value] = this.getStandardFormat(this.getKeyValue(line));
                        lastObject = {
                            [key]: value
                        };
                    } else if (lastObject && line.length === 0) { // end of object

                        const objTmp = this.getStandardObject(lastObject);
                        if (filterFunction(objTmp)) {
                            if (!!forEachFunction) {
                                forEachFunction(objTmp);
                            } else {
                                objects.push(objTmp);
                            }
                        }
                        lastObject = null;

                    } else if (lastObject) {
                        const [key, value] = this.getStandardFormat(this.getKeyValue(line));
                        if (key && (!fields.length || fields.includes(key))) {
                            if (lastObject[key]) {
                                if (!Array.isArray(lastObject[key])) {
                                    lastObject[key] = [lastObject[key]];
                                }
                                lastObject[key].push(value);
                            } else {
                                lastObject[key] = value;
                            }
                        }

                    }
                })
                .on("error", (error) => {
                    if (this.params.deleteCorruptedCacheFile) {
                        try {
                            fs.unlinkSync(compressedFile);
                        } catch (error) {
                            console.log(`Corrupted file ${compressedFile} already deleted`);
                        }
                    }

                    return reject(error, `Delete the cache file ${compressedFile}`);
                })
                .on("close", () => {
                    resolve(objects);
                })

        });

    }

    getKeyValue = (line) => {
        return line.split(/:(.+)/).filter(i => i.length).map(i => i.trim());
    }

    getStandardFormat = ([key, value]) => {
        if (key && value && !key.startsWith("#") && !key.startsWith("%")) {
            return [key, value];
        }

        return [null, null];
    };

    getStandardObject = (object) => {
        if (object.remarks) {
            if (!Array.isArray(object.remarks)) {
                object.remarks = [object.remarks];
            }
        }

        if (object.members) {
            if (!Array.isArray(object.members)) {
                object.members = [object.members];
            }
        }

        return object;
    };

    getCacheFileName = (originalName) => {
        return [this.cacheDir, md5(originalName)]
            .join("/")
            .replace("//", "/");
    };

    _isCacheValid = (file, days) => {
        file = file ?? this.cacheFile;
        days = days ?? this.daysWhoisCache;

        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            const lastDownloaded = moment(stats.ctime);

            if (moment(moment()).diff(lastDownloaded, 'days') <= days){
                return true;
            }
        }

        return false;
    };

    _writeFile = (file, data) => {
        if (typeof(data) === "object") {
            fs.writeFileSync(file, JSON.stringify(data));
        } else {
            fs.writeFileSync(file, data);
        }

        return Promise.resolve(data);
    }

    _readFile = (file, json) => {
        try {
            let content = fs.readFileSync(file, 'utf-8');

            if (json) {
                content = JSON.parse(content);
            }

            return Promise.resolve(content);

        } catch (error) {
            return Promise.reject(error);
        }
    }

    _downloadAndReadFile = (url, file, days=1, json=true) => {
        if (!this._isCacheValid(file, days)) {
            return this._downloadFile(url, file)
                .then(() => this._readFile(file, json));
        } else {
            return this._readFile(file, json);
        }
    }

    // _retryDownload = (url, file, times) => {
    //     const attempts = Array.apply(null, Array(times)).map(function () {});
    //     let answer = {
    //         response: null,
    //         error: null
    //     }
    //     return batchPromises(1, attempts, attempt => {
    //         return this._downloadFile2(url, file)
    //             .catch(error => {
    //                 answer.response = null;
    //                 answer.error = error;
    //                 return Promise.resolve();
    //             })
    //             .then(result => {
    //                 answer.response = result;
    //                 answer.error = null;
    //                 return Promise.reject();
    //             });
    //     })
    //         .then(() => {
    //             return answer.error ? Promise.reject(answer.error) : Promise.resolve(answer.response);
    //         })
    // }

    // _downloadFile = (url, file) => {
    //     return this._retryDownload(url, file, 2);
    // }

    _downloadFile = (url, file) => {
        return new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(file);
            const protocol = url.toLowerCase().split(":")[0];

            const options = urlParser.parse(url);
            options.agent = proto[protocol].agent;
            options.method = 'GET';
            options.gzip = true;
            options.timeout = 10000;
            options.keepAliveTimeout = 600000;

            proto[protocol].fetch
                .get(options, response => {
                    response.pipe(fileStream);

                    fileStream.on('finish', _ => {
                        resolve(file);
                    });
                })
                .on('error', e => {
                    console.log(e);
                });
        });
    }

    // _downloadFile = (url, file) => {
    //     const segments = file.split("/");
    //     const fileName = segments.pop();
    //     const directory = segments.join("/");
    //
    //     const downloader = new Downloader({
    //         url: url,
    //         directory,
    //         fileName,
    //         cloneFiles: false,
    //         maxAttempts: 2
    //     });
    //
    //     return downloader.download()
    //         .then(() => file);
    // }

    _getDump = () => {

        if (this._isCacheValid()) {
            console.log(`[${this.connectorName}] Using cached whois data`);
            return Promise.resolve(this.cacheFile);
        } else {
            console.log(`[${this.connectorName}] Downloading whois data`);

            return this._downloadFile(this.dumpUrl, this.cacheFile)
                .catch(error => {
                    console.log(`Delete the cache file ${this.cacheFile}`);

                    return Promise.reject(error);
                });
        }
    }

    getObjects = (types, filterFunction, fields, forEachFunction) => {
        fields = fields || [];
        return this._getDump()
            .then(file => {
                console.log(`[${this.connectorName}] Parsing whois data: ${types}`);
                return Promise.all(types.map(type => this._readLines(file, type, filterFunction, fields, forEachFunction)))
                    .then(objects => objects.flat());
            });
    };
}
