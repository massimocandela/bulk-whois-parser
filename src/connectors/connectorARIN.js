import Connector from "./connector";
import ConnectorARINrir from "./connectorARINrir";
import ConnectorARINrr from "./connectorARINrr";

export default class ConnectorARIN extends Connector {
    constructor(params) {
        super(params);

        this.rir = new ConnectorARINrir(params);
        this.rr = new ConnectorARINrr(params);

    };

    _getCorrectConnector = (type, filterFunction, fields) => {
        if (["inetnum", "inet6num"].includes(type)) {
            return this.rir.getObjects([type], filterFunction, fields);
        } else {
            return this.rr.getObjects([type], filterFunction, fields);
        }
    };


    getObjects = (types, filterFunction, fields) => {
        fields = fields || [];

        return Promise.all(types.map(type => this._getCorrectConnector(type, filterFunction, fields)))
            .then(objects => {
                return [].concat.apply([], objects);
            });
    }

}
