import batchPromises from "batch-promises";
import fs from "fs";
import Connector from "./connector";
import ConnectorLACNICrr from './connectorLACNICrr';

export default class ConnectorLACNIC extends Connector {
    constructor(params) {
        super(params)

        this._getObjects = Connector.prototype.getObjects.bind(this)
        this.rr = new ConnectorLACNICrr(params);

        this.connectorName = "lacnic";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "http://ftp.lacnic.net/lacnic/dbase/lacnic.db.gz";
        this.cacheFile = [this.cacheDir, "lacnic.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }

    _getCorrectConnector = (type, filterFunction, fields) => {
        if (["route", "route6", "as-set", "aut-num", "mntner", "person"].includes(type)) {
            return this.rr.getObjects([type], filterFunction, fields);
        } else {
            return this._getObjects([type], filterFunction, fields);
        }
    };

    getObjects = (types, filterFunction, fields) => {
        fields = fields || [];

        return batchPromises(1, types, type => {
            return this._getCorrectConnector(type, filterFunction, fields)
        })
            .then(objects => [].concat.apply([], objects));
    }
}
