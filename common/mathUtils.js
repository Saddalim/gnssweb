
export const SPEED_OF_LIGHT = 299792458; // [m/s]

/**
 * Linear interpolation
 * @param x
 * @param y
 * @param a
 * @returns {number}
 */
export function lerp(x, y, a)
{
    return x * (1 - a) + y * a;
}

/**
 * Linear interpolation for all members of given objects (assuming they share the same keys)
 * @param x
 * @param y
 * @param a
 * @returns {{[p: string]: number}}
 */
export function lerpAll(x, y, a)
{
    return Object.fromEntries(Object.entries(x).map(e => [e[0], lerp(e[1], y[e[0]], a)]));
}

/**
 * Generate a linear range between min and max with given step
 * @param min
 * @param max
 * @param step
 * @returns {*[]}
 */
export function arange(min, max, step)
{
    let ret = [];
    for (let num = min; num <= max; num += step)
    {
        ret.push(num);
    }
    return ret;
}

/**
 * Generate a linear range between min and max in the given number of steps
 * @param min
 * @param max
 * @param n
 * @returns {*[]}
 */
export function linspace(min, max, n)
{
    const d = (max-min) / n;
    let ret = [];
    for (let i = 0; i < n; ++i)
    {
        ret.push(min + i * d);
    }
    return ret;
}

/**
 * Lomb-Scargle periodogram
 * @param x
 * @param y
 * @param freq Array of frequencies to test
 * @param normalize
 * @returns {*[]}
 */
export function lombScargle(x, y, freq, normalize) {
    let periodogram = [];
    let c, s, xc, xs, cc, ss, cs;
    let tau, c_tau, s_tau, c_tau2, s_tau2, cs_tau;
    let normVal = x.length;

    for (let i = 0; i < freq.length; i++) {
        xc = 0.0;
        xs = 0.0;
        cc = 0.0;
        ss = 0.0;
        cs = 0.0;
        for (let j = 0; j < x.length; j++) {
            c = Math.cos(freq[i] * x[j]);
            s = Math.sin(freq[i] * x[j]);
            xc += y[j] * c;
            xs += y[j] * s;
            cc += c * c;
            ss += s * s;
            cs += c * s;
        }
        tau = Math.atan2(2 * cs, cc - ss) / (2 * freq[i]);
        c_tau = Math.cos(freq[i] * tau);
        s_tau = Math.sin(freq[i] * tau);
        c_tau2 = c_tau * c_tau;
        s_tau2 = s_tau * s_tau;
        cs_tau = 2 * c_tau * s_tau;

        periodogram[i] = 0.5 * ((Math.pow(c_tau * xc + s_tau * xs, 2) / (c_tau2 * cc + cs_tau * cs + s_tau2 * ss)) +
            (Math.pow(c_tau * xs - s_tau * xc, 2) / (c_tau2 * ss - cs_tau * cs + s_tau2 * cc)));

        if (normalize) {
            periodogram[i] = Math.sqrt(4 * periodogram[i] / normVal);
        }

    }
    return periodogram;
}
