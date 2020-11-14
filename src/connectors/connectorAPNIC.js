import Connector from "./connector";
import axios from "axios";
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


    _isCacheValid = () => {
        if (this.cacheFiles.every(fs.existsSync)) {
            const stats = fs.statSync(this.cacheFiles[0]);
            const lastDownloaded = moment(stats.mtime);

            if (moment(lastDownloaded).diff(moment(), 'days') <= this.daysWhoisCache){
                return true;
            }
        }

        return false;
    };

    _getDumpFile = (url) => {
        const cacheFile = this.getCacheFileName(url);
        const writer = fs.createWriteStream(cacheFile);

        return axios({
            url,
            method: 'GET',
            responseType: 'stream'
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


    _multiReadLines = (files, type, filterFunction, fields = []) => {
        return Promise
            .all(files.map(file => this._readLines(file, type, filterFunction, fields)))
            .then(objects => [].concat.apply([], objects));
    };

    _getDump = () => {

        if (this._isCacheValid()) {
            console.log("[APNIC] Using cached whois data");
            return Promise.resolve(this.cacheFiles);
        } else {
            console.log("[APNIC] Downloading whois data");

            return Promise
                .all(this.dumpUrls.map(this._getDumpFile));
        }
    }


    getObjects = (types, filterFunction, fields) => {

        return this._getDump()
            .then(file => {
                console.log(`[${this.connectorName}] Parsing whois data`);
                return Promise.all(types.map(type => this._multiReadLines(file, type, filterFunction, fields)))
                    .then(objects => {
                        return [].concat.apply([], objects);
                    });
            });
    }

}