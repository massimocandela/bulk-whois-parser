import Connector from "./connector";
import ConnectorARINrir from "./connectorARINrir";
import ConnectorARINrr from "./connectorARINrr";
import batchPromises from "batch-promises";

export default class ConnectorARIN extends Connector {
    constructor(params) {
        super(params);

        this.rir = new ConnectorARINrir(params);
        this.rr = new ConnectorARINrr(params);

    };

    _getCorrectConnector = (type, filterFunction, fields, forEachFunction) => {
        if (["inetnum", "inet6num"].includes(type)) {
            return this.rir.getObjects([type], filterFunction, fields, forEachFunction);
        } else {
            return this.rr.getObjects([type], filterFunction, fields, forEachFunction);
        }
    };


    getObjects = (types, filterFunction, fields, forEachFunction) => {
        fields = fields || [];
        const objects = [];

        return batchPromises(1, types, type => {
            return this._getCorrectConnector(type, filterFunction, fields, forEachFunction)
                .then(data => objects.push(data));
        })
            .then(() => objects.flat());
    };

}
