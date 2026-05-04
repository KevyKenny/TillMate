const mongoose = require('mongoose');

async function connectDatabase(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
  });
  return mongoose.connection;
}

module.exports = { connectDatabase };
