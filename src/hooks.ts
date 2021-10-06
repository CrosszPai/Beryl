import type { GetSession, Handle } from '@sveltejs/kit';
import { GithubAuthentication, TokenResponse } from './api/authentication';
import cookie from 'cookie';
import type { GithubUser } from './global';
import dayjs from 'dayjs/esm';
import { USER } from '$graphql/query/user.gql';
import { GRAPHQL_ENDPOINT } from '$lib/Env';


export const getSession: GetSession = async (request) => {
	const cookieToken = cookie.parse(request.headers.cookie ?? '');

	let token: TokenResponse = { ...cookieToken };
	let user: GithubUser | null = request.locals.user;

	// expire case
	if (!token.access_token && token.refresh_token?.length !== 0) {
		try {
			token = await GithubAuthentication.getTokenFromRefreshToken(token.refresh_token);
			request.locals.token = token;
		} catch (error) {
			console.log(error);
		}
	}
	console.log(token)
	if (token.access_token !== "undefined" && token.access_token) {
		console.log(token.access_token, "==============", typeof token.access_token)
		const gh_user = await GithubAuthentication.getBasicUserProfile(token.access_token);
		const headers = new Headers()
		headers.append('authorization', token.access_token)
		headers.append('Content-Type', 'application/json')
		const res = await fetch(GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify({
				query: USER.loc.source.body
			})
		})
		const data = await res.json()
		console.log(data);
		request.locals.user = data.data.user;


		return { token, user: data.data.user };
	}


	try {
		token = await GithubAuthentication.signInByCode(request.query);

		user = await GithubAuthentication.getBasicUserProfile(token.access_token);
		request.locals.user = user;
		request.locals.token = token;
		return {
			token,
			user
		};

	} catch (error) {
		console.log(error);
	}
	return {
		token: {},
		user: {}
	};

};

export const handle: Handle = async ({ request, resolve }) => {
	// code here happends before the endpoint or page is called
	const response = await resolve(request);

	// code here happens after the endpoint or page is called after getSessioon
	if (request.locals.token?.refresh_token) {
		let now = dayjs().add(request.locals.token.expires_in, 'second')
		let now2 = dayjs().add(request.locals.token.refresh_token_expires_in, 'second')
		//@ts-ignore
		response.headers['set-cookie'] = [
			`access_token=${request.locals.token?.access_token};Expires=${now.toString()};`,
			`refresh_token=${request.locals.token?.refresh_token};Expires=${now2.toString()};`
		];
	}

	if (request.query.get('code')) {
		response.headers['Location'] = '/';
		response.status = 302;

		return response;
	}
	return response;
};
