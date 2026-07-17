const DUBLIN_TIME_ZONE = 'Europe/Dublin';
const DUBLIN_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=53.3498&longitude=-6.2603&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&temperature_unit=celsius&wind_speed_unit=kmh&timezone=Europe%2FDublin';
const HOLIDAY_API_BASE_URL = 'https://date.nager.at/api/v3/PublicHolidays';

function dublinDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DUBLIN_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((values, part) => ({ ...values, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, year: Number(parts.year), weekday: parts.weekday, time: `${parts.hour}:${parts.minute}` };
}

function validWeather(current) {
  if (!current || !Number.isFinite(current.temperature_2m)) return null;
  return {
    temperature_c: current.temperature_2m,
    apparent_temperature_c: current.apparent_temperature,
    precipitation_mm: current.precipitation,
    wind_speed_kmh: current.wind_speed_10m,
    weather_code: current.weather_code
  };
}

async function jsonIfOk(result) {
  if (result.status !== 'fulfilled' || !result.value.ok) return null;
  return result.value.json();
}

async function loadLiveContext(fetchImpl = fetch, now = new Date()) {
  const local = dublinDateParts(now);
  const [weatherResult, thisYearResult, nextYearResult] = await Promise.allSettled([
    fetchImpl(DUBLIN_WEATHER_URL),
    fetchImpl(`${HOLIDAY_API_BASE_URL}/${local.year}/IE`),
    fetchImpl(`${HOLIDAY_API_BASE_URL}/${local.year + 1}/IE`)
  ]);
  const [weatherData, thisYearHolidays, nextYearHolidays] = await Promise.all([jsonIfOk(weatherResult), jsonIfOk(thisYearResult), jsonIfOk(nextYearResult)]);
  const publicHolidays = [...(Array.isArray(thisYearHolidays) ? thisYearHolidays : []), ...(Array.isArray(nextYearHolidays) ? nextYearHolidays : [])]
    .filter((holiday) => holiday && typeof holiday.date === 'string' && typeof holiday.name === 'string')
    .map(({ date, name }) => ({ date, name }));
  const holidayToday = publicHolidays.find((holiday) => holiday.date === local.date) || null;
  return {
    location: 'Dublin, Ireland', local_date: local.date, local_weekday: local.weekday, local_time: local.time,
    routine_service_hours: 'Monday to Saturday, 09:00–17:00 Dublin time', emergency_service_hours: '24 hours a day, 7 days a week',
    public_holiday_today: holidayToday, irish_public_holidays: publicHolidays, weather_now: validWeather(weatherData?.current)
  };
}

module.exports = { DUBLIN_WEATHER_URL, HOLIDAY_API_BASE_URL, dublinDateParts, loadLiveContext, validWeather };
