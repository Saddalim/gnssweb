
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

export function isBetween(val, min, max)
{
    return val >= min && val <= max;
}

export function isWithin(val, range)
{
    return val >= range.min && val <= range.max;
}

/**
 * Lomb-Scargle periodogram
 * @param {float[]} x
 * @param {float[]} y
 * @param {float[]} freq Array of frequencies to test
 * @param {boolean} normalize
 * @returns {float[]} Periodogram amplitudes for each given frequency
 */
export function lombScargle(x, y, freq, normalize)
{
    let periodogram = [];
    let c, s, xc, xs, cc, ss, cs;
    let tau, c_tau, s_tau, c_tau2, s_tau2, cs_tau;
    let normVal = x.length;

    for (let i = 0; i < freq.length; i++)
    {
        xc = 0.0;
        xs = 0.0;
        cc = 0.0;
        ss = 0.0;
        cs = 0.0;
        for (let j = 0; j < x.length; j++)
        {
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

        if (normalize)
        {
            periodogram[i] = Math.sqrt(4 * periodogram[i] / normVal);
        }

    }
    return periodogram;
}

/**
 * Fit a quadratic (2nd order) function to a given set of points
 * @param {float[]} x
 * @param {float[]} y
 * @returns {float[]} An array containing the ith order coefficients
 */
export function quadraticFit(x, y)
{
    if (x.length !== y.length) return null;
    let coefs = [];
    let sumX = 0.0, sumY = 0.0, sumX2 = 0.0, sumX3 = 0.0, sumX4 = 0.0, sumXY = 0.0, sumX2Y = 0.0;
    for (let i = 0; i < x.length; i++)
    {
        sumX += x[i];
        sumY += y[i];
        sumX2 += x[i] * x[i];
        sumX3 += x[i] * x[i] * x[i];
        sumX4 += x[i] * x[i] * x[i] * x[i];
        sumXY += x[i] * y[i];
        sumX2Y += x[i] * x[i] * y[i];
    }
    let m = [[sumX4, sumX3, sumX2], [sumX3, sumX2, sumX], [sumX2, sumX, x.length]];
    let c = [sumX2Y, sumXY, sumY];
    for (let i = 0; i < 2; i++)
    {
        for (let j = i + 1; j < 3; j++)
        {
            const ratio = m[j][i] / m[i][i];
            for (let k = 0; k < 3; k++)
            {
                m[j][k] -= ratio * m[i][k];
            }
            c[j] -= ratio * c[i];
        }
    }
    coefs[0] = c[2] / m[2][2];
    coefs[1] = (c[1] - m[1][2] * coefs[0]) / m[1][1];
    coefs[2] = (c[0] - m[0][1] * coefs[1] - m[0][2] * coefs[0]) / m[0][0];

    return coefs;
}