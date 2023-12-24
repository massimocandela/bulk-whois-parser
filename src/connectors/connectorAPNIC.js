import Connector from "./connector";
import axios from "redaxios";
import fs from "fs";
import moment from "moment";

export default class ConnectorAPNIC extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "apnic";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrls = this.params.dumpUrls || [
            "http://ftp.apnic.net/apnic/whois/apnic.db.inetnum.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.inet6num.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.as-block.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.as-set.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.aut-num.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.filter-set.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.inet-rtr.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.irt.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.key-cert.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.mntner.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.organisation.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.peering-set.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.rtr-set.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.role.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.route-set.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.route.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.route6.gz",
            "http://ftp.apnic.net/apnic/whois/apnic.db.rtr-set.gz",
        ];

        this.cacheFiles = this.dumpUrls.map(this.getCacheFileName);
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }

    _getDumpFile = (url) => {
        const cacheFile = this.getCacheFileName(url);
        const writer = fs.createWriteStream(cacheFile);

        return axios({
            url,
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
                    writer.on('finish', () => {
                        resolve(cacheFile);
                        writer.end();
                    });
                    writer.on('error', error => {
                        return reject(error, `Delete the cache file ${cacheFile}`);
                    });
                })
            });
    }


    _multiReadLines = (files, type, filterFunction, fields = [], forEachFunction) => {
        return Promise
            .all(files.map(file => this._readLines(file, type, filterFunction, fields, forEachFunction)))
            .then(objects => objects.flat());
    };

    _isCacheValid = () => {
        return this.cacheFiles
            .every(file => {
                if (fs.existsSync(file)) {
                    const stats = fs.statSync(file);
                    const lastDownloaded = moment(stats.ctime);

                    if (moment(moment()).diff(lastDownloaded, 'days') <= this.daysWhoisCache){
                        return true;
                    }
                }

                return false;
            });
    };

    _getDump = () => {

        if (this._isCacheValid()) {
            console.log("[apnic] Using cached whois data");
            return Promise.resolve(this.cacheFiles);
        } else {
            console.log("[apnic] Downloading whois data");

            return Promise
                .all(this.dumpUrls.map(this._getDumpFile));
        }
    }


    getObjects = (types, filterFunction, fields, forEachFunction) => {

        return this._getDump()
            .then(file => {
                console.log(`[${this.connectorName}] Parsing whois data`);
                return Promise.all(types.map(type => this._multiReadLines(file, type, filterFunction, fields, forEachFunction)))
                    .then(objects => objects.flat());
            });
    }

}