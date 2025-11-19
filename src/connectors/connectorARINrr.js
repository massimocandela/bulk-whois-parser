import Connector from "./connector";
import fs from "fs";

export default class ConnectorARINrr extends Connector {
    constructor(params) {
        super(params);

        this.connectorName = "arin-rr";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "https://ftp.arin.net/pub/rr/arin.db.gz";
        this.cacheFile = [this.cacheDir, "arin.db.gz"].join("/").replace("//", "/");
        this.daysWhoisCache = this.params.defaultCacheDays || 2;

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, {recursive: true});
        }
    }
}
