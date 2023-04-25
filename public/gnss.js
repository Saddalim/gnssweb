export let mu = 3.986004418e14; // Standard gravitational parameter of Earth [m^3/s^2]
export function KOE2ECI(a, e, i, M0, omega, OMEGA, dt = 0, keplerAccuracy = 10e-8, maxKeplerIterations = 100)
{
    // Constants

    let M = NaN;

    // Result is the same but can speed up calculation by checking
    if (dt === 0)
        M = M0;
    else
        M = M0 + dt * Math.sqrt(mu/(a**3));

    // Calculate eccentric anomaly E(t) by numerically approximating Kepler's equation
    let E = M;
    for (let j = 0; j < maxKeplerIterations; ++j)
    {
        let E1 = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        let diff = Math.abs(E1 - E);
        E = E1;
        if (diff < keplerAccuracy)
            break;
    }

    // Calculate true anomaly (nu)
    let nu = 2.0 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E/2), Math.sqrt(1 - e) * Math.cos(E/2));

    // Calculate position and velocity in orbital plane
    // Distance to the central body
    let r = a * (1 - e * Math.cos(E));

    // Position
    let po = [
        r * Math.cos(nu),
        r * Math.sin(nu),
        0
    ];

    // Velocity
    let magicMultiplier = Math.sqrt(mu * a) / r;
    let vo = [
        magicMultiplier * (-Math.sin(E)),
        magicMultiplier * Math.sqrt(1 - e**2) * Math.cos(E),
        0
    ];

    // Transform coordinates to the inertial frame in bodycentric rectangular coordinates
    let sinOmega = Math.sin(omega);
    let sinOMEGA = Math.sin(OMEGA);
    let cosOmega = Math.cos(omega);
    let cosOMEGA = Math.cos(OMEGA);
    let sinI = Math.sin(i);
    let cosI = Math.cos(i);

    let pos = [
        po[0] * (cosOmega * cosOMEGA - sinOmega * cosI * sinOMEGA) - po[1] * (sinOmega * cosOMEGA + cosOmega * cosI * sinOMEGA),
        po[0] * (cosOmega * sinOMEGA + sinOmega * cosI * cosOMEGA) + po[1] * (cosOmega * cosI * cosOMEGA - sinOmega * sinOMEGA),
        po[0] * (sinOmega * sinI) + po[1] * (cosOmega * sinI)
    ];

    let vel = [
        vo[0] * (cosOmega * cosOMEGA - sinOmega * cosI * sinOMEGA) - vo[1] * (sinOmega * cosOMEGA + cosOmega * cosI * sinOMEGA),
        vo[0] * (cosOmega * sinOMEGA + sinOmega * cosI * cosOMEGA) + vo[1] * (cosOmega * cosI * cosOMEGA - sinOmega * sinOMEGA),
        vo[0] * (sinOmega * sinI) + vo[1] * (cosOmega * sinI)
    ];

    return [pos, vel];
}

export function semiCirclesToRad(sc)
{
    return sc * Math.PI;
}

export function deg2rad(deg)
{
    return deg * Math.PI / 180.0;
}


