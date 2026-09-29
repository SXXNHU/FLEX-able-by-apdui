package com.flexable.importing.domain;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import com.flexable.ledger.domain.Category;

/** 가맹점 이름으로 카테고리를 추측한다. 순서가 중요하다 (메가커피는 카페, 메가박스는 문화). */
public final class CategoryGuesser {

	private static final List<Map.Entry<Pattern, Category>> RULES = List.of(
			rule("카페|커피|스타벅스|투썸|이디야|메가커피|메가mgc|컴포즈|빽다방|폴바셋|블루보틀|할리스|공차|베이커리|파리바게뜨|뚜레쥬르", Category.CAFE),
			rule("택시|카카오t|버스|지하철|철도|코레일|ktx|srt|티머니|교통|주유|주차|쏘카|따릉이", Category.TRANSPORT),
			rule("cgv|메가박스|롯데시네마|영화|공연|티켓|인터파크|yes24|넷플릭스|멜론|스포티파이|전시", Category.CULTURE),
			rule("쿠팡|11번가|g마켓|옥션|무신사|지그재그|올리브영|다이소|네이버페이|스토어|몰|아울렛|백화점|이마트|홈플러스|롯데마트", Category.SHOPPING),
			rule("관리비|월세|전기|가스|수도|통신|kt|skt|lgu|보험", Category.HOUSING),
			rule("식당|김밥|분식|치킨|피자|버거|맥도날드|롯데리아|배달의민족|배민|요기요|쿠팡이츠|편의점|gs25|씨유|cu편의점|세븐일레븐|이마트24|국밥|반점|식육|푸드",
					Category.FOOD));

	private CategoryGuesser() {
	}

	private static Map.Entry<Pattern, Category> rule(String regex, Category category) {
		return Map.entry(Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE), category);
	}

	public static Category guess(String title) {
		return RULES.stream()
			.filter((r) -> r.getKey().matcher(title).find())
			.map(Map.Entry::getValue)
			.findFirst()
			.orElse(Category.ETC);
	}

}
