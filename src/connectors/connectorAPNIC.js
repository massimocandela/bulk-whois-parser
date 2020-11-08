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
            "https://ftp.apnic.net/apnic/whois/apnic.db.inetnum.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.inet6num.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.as-block.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.as-set.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.aut-num.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.filter-set.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.inet-rtr.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.irt.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.key-cert.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.mntner.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.organisation.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.peering-set.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.rtr-set.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.role.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.route-set.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.route.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.route6.gz",
            "https://ftp.apnic.net/apnic/whois/apnic.db.rtr-set.gz",
        ];

        this.cacheFiles = this.dumpUrls.map(this.getCacheFileName);
        this.daysWhoisCache = this.params.defaultCacheDays || 1;

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
                return Promise.all(types.map(type => this._multiReadLines(file, type, filterFunction, fields)))
                    .then(objects => {
                        return [].concat.apply([], objects);
                    });
            });
    }

}