import axios from 'axios';
import CircuitBreaker from 'opossum';
import { logger } from '@nitiops/service-template';

const OPA_URL = process.env.OPA_URL || 'http://opa:8181';
const OPA_TIMEOUT = 1000; // 1 second

const circuitBreakerOptions = {
    timeout: OPA_TIMEOUT,
    errorThresholdPercentage: 50,
    resetTimeout: 5000
};

async function queryOPA(input: any) {
    const response = await axios.post(`${OPA_URL}/v1/data/main/response`, { input }, {
        timeout: OPA_TIMEOUT
    });
    return response.data.result;
}

const breaker = new CircuitBreaker(queryOPA, circuitBreakerOptions);

breaker.fallback(() => {
    logger.error('OPA Circuit/Timeout fallback triggered');
    // Security by Default: If OPA is down, we DENY.
    return {
        allow: false,
        reasons: ["Authorization service unavailable"],
        policy_version: "unavailable",
        decision_id: "error-fallback"
    };
});

export const evaluatePolicy = async (input: any) => {
    return breaker.fire(input);
};
