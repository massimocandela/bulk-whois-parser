import Connector from "./connector";
import fs from "fs";

export default class ConnectorRIPE extends Connector {
    constructor(params) {
        super(params)

        this.connectorName = "ripe";
        this.cacheDir += this.connectorName + "/";
        this.dumpUrl = this.params.dumpUrl || "ftp://ftp.ripe.net/ripe/dbase/ripe.db.gz";
        this.cacheFile = [this.cacheDir, "ripe.db.gz"].join("/").replace("//", "/");

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir,  { recursive: true });
        }
    }
}
