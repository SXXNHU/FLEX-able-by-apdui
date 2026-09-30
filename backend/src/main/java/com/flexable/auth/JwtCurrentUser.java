package com.flexable.auth;

import com.flexable.user.CurrentUser;
import com.flexable.user.UserRepository;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/** Access Token의 subject가 사용자 ID다. */
@Component
class JwtCurrentUser implements CurrentUser {

	private final UserRepository users;

	JwtCurrentUser(UserRepository users) {
		this.users = users;
	}

	@Override
	public String id() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication instanceof JwtAuthenticationToken jwt && jwt.getToken().getSubject() != null) {
			return jwt.getToken().getSubject();
		}
		throw AuthException.unauthorized();
	}

	@Override
	public String requireId() {
		String id = id();
		if (!users.existsById(id)) {
			throw AuthException.unauthorized();
		}
		return id;
	}

}
