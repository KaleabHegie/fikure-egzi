// cPanel / Phusion Passenger entry point ("Application startup file").
// Passenger loads startup files with require(); the API is an ES module, so
// hand off via dynamic import, which works on every supported Node version.
import('./dist/main.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
