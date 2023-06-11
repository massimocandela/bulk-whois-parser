import md5 from "md5";
import fs from "fs";
import readline from "readline";
import zlib from "zlib";
import moment from "moment";
import axios from "axios";

export default class Connector {
    constructor(params) {
        this.params = params || {};
        this.userAgent = params.userAgent || "bulk-whois-parser";
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

    _getDump = () => {

        if (this._isCacheValid()) {
            console.log(`[${this.connectorName}] Using cached whois data`);
            return Promise.resolve(this.cacheFile);
        } else {
            console.log(`[${this.connectorName}] Downloading whois data`);
            const writer = fs.createWriteStream(this.cacheFile);

            return axios({
                url: this.dumpUrl,
                method: 'GET',
                responseType: 'stream',
                headers: {
                    'Accept-Encoding': 'gzip',
                    'User-Agent': this.userAgent
                }
            })
                .then( (response) => {
                    response.data.pipe(writer);

                    return new Promise((resolve, reject) => {
                        writer.on('finish', () => resolve(this.cacheFile))
                        writer.on('error', error => {
                            return reject(error, `Delete the cache file ${this.cacheFile}`);
                        });
                    })
                });
        }
    }

    getObjects = (types, filterFunction, fields, forEachFunction) => {
        fields = fields || [];
        return this._getDump()
            .then(file => {
                console.log(`[${this.connectorName}] Parsing whois data: ${types}`);
                return Promise.all(types.map(type => this._readLines(file, type, filterFunction, fields, forEachFunction)))
                    .then(objects => {
                        return [].concat.apply([], objects);
                    });
            });
    };


    cacheOperationOutput = (operation, cacheFile, days) => {
        if (this._isCacheValid(cacheFile, days)) {
            return Promise.resolve(fs.readFileSync(cacheFile, "utf8"));
        } else {

            return operation()
                .then(data => {

                    const str = JSON.stringify(data);
                    fs.writeFileSync(cacheFile, str);

                    return str;
                });
        }
    };
}