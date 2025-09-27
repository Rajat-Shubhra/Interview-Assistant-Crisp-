import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
	FLUSH,
	PAUSE,
	PERSIST,
	PURGE,
	REGISTER,
	REHYDRATE,
	persistReducer,
	persistStore
} from "redux-persist";
import storage from "redux-persist/lib/storage";

import candidatesReducer from "./slices/candidatesSlice";
import sessionReducer from "./slices/sessionSlice";

const rootReducer = combineReducers({
	session: sessionReducer,
	candidates: candidatesReducer
});

const persistConfig = {
	key: "interview-assistant",
	storage,
	version: 1,
	whitelist: ["session", "candidates"]
};

const persistedReducer = persistReducer<ReturnType<typeof rootReducer>>(persistConfig, rootReducer);

export const store = configureStore({
	reducer: persistedReducer,
	middleware: (getDefaultMiddleware) =>
		getDefaultMiddleware({
			serializableCheck: {
				ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER]
			}
		})
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
