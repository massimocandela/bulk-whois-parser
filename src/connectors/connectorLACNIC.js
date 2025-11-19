import Connector from "./connector";
import ConnectorLACNICrir from "./connectorLACNICrir";
import ConnectorLACNICrr from "./connectorLACNICrr";
import batchPromises from "batch-promises";

export default class ConnectorLACNIC extends Connector {
    constructor(params) {
        super(params);

        this.rir = new ConnectorLACNICrir(params);
        this.rr = new ConnectorLACNICrr(params);
    }


    _getCorrectConnector = (type, filterFunction, fields, forEachFunction) => {
        if (["route", "route6", "as-set", "aut-num", "mntner", "person"].includes(type)) {
            return this.rr.getObjects([type], filterFunction, fields, forEachFunction);
        } else {
            return this.rir.getObjects([type], filterFunction, fields, forEachFunction);
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
