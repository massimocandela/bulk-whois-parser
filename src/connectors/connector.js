import md5 from "md5";
import fs from "fs";
import readline from "readline";
import zlib from "zlib";
import moment from "moment";
import axios from "axios";

export default class Connector {
    constructor(params) {
        this.params = params || {};
        this.connectorName = "connector";
        this.cacheDir = this.params.cacheDir || ".cache/";
        this.cacheFile = null;
        this.dumpUrl = null;
        this.daysWhoisCache = this.params.defaultCacheDays || 1;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }

    _readLines = (compressedFile, type, filterFunction, fields = []) => {
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
                            objects.push(objTmp);
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
        // if (object.inetnum) {
        //     try {
        //         object.inetnum = ipUtils.ipRangeToCidr(...object.inetnum.split("-").map(i => i.trim()));
        //     } catch(e) {
        //         // Nothing
        //     }
        // }

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

    _isCacheValid = () => {
        if (fs.existsSync(this.cacheFile)) {
            const stats = fs.statSync(this.cacheFile);
            const lastDownloaded = moment(stats.ctime);

            if (moment(moment()).diff(lastDownloaded, 'days') <= this.daysWhoisCache){
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
                responseType: 'stream'
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

    getObjects = (types, filterFunction, fields) => {
        fields = fields || [];
        return this._getDump()
            .then(file => {
                console.log(`[${this.connectorName}] Parsing whois data: ${types}`);
                return Promise.all(types.map(type => this._readLines(file, type, filterFunction, fields)))
                    .then(objects => {
                        return [].concat.apply([], objects);
                    });
            });
    }
}