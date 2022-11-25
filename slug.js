/* global btoa */
(function(root) {
	let base64

	// This function's sole purpose is to help us ignore lone surrogates so that
	// malformed strings don't throw in the browser while being processed
	// permissively in Node.js. If we didn't care about parity, we could get rid
	// of it.
	// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charAt
	function getWholeCharAndI(str, i) {
		const code = str.charCodeAt(i)

		// This is a coherence check. `code` should never be `NaN`.
		/* istanbul ignore if */
		if (isNaN(code)) {
			throw new RangeError('Index ' + i + ' out of range for string "' + str + '"; please open an issue at https://github.com/Trott/slug/issues/new')
		}
		if (code < 0xD800 || code > 0xDFFF) {
			return [str.charAt(i), i] // Non-surrogate character, keeping 'i' the same
		}

		// High surrogate
		if (code >= 0xD800 && code <= 0xDBFF) {
			if (str.length <= (i + 1)) {
				// High surrogate without following low surrogate
				return [' ', i]
			}
			const next = str.charCodeAt(i + 1)
			if (next < 0xDC00 || next > 0xDFFF) {
				// High surrogate without following low surrogate
				return [' ', i]
			}
			return [str.charAt(i) + str.charAt(i + 1), i + 1]
		}

		// Low surrogate (0xDC00 <= code && code <= 0xDFFF)
		if (i === 0) {
			// Low surrogate without preceding high surrogate
			return [' ', i]
		}

		const prev = str.charCodeAt(i - 1)

		/* istanbul ignore else */
		if (prev < 0xD800 || prev > 0xDBFF) {
			// Low surrogate without preceding high surrogate
			return [' ', i]
		}

		/* istanbul ignore next */
		throw new Error('String "' + str + '" reaches code believed to be unreachable; please open an issue at https://github.com/Trott/slug/issues/new')
	}

	if (typeof window !== 'undefined') {
		if (window.btoa) {
			base64 = function(input) {
				return btoa(unescape(encodeURIComponent(input)))
			}
		} else {
			// Polyfill for environments that don't have btoa or Buffer class (notably, React Native).
			// Based on https://github.com/davidchambers/Base64.js/blob/a121f75bb10c8dd5d557886c4b1069b31258d230/base64.js
			base64 = function(input) {
				const str = unescape(encodeURIComponent(input + ''))
				let output = ''
				for (
					let block, charCode, idx = 0, map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='; str.charAt(idx | 0) || (map = '=', idx % 1); output += map.charAt(63 & block >> 8 - idx % 1 * 8)
				) {
					charCode = str.charCodeAt(idx += 3 / 4)
					// This is a coherence check. The result of unescape(encodeURIComponent()) should always be
					// characters with code points that fit into two bytes.
					/* istanbul ignore next */
					if (charCode > 0xFF) {
						throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.")
					}
					block = block << 8 | charCode
				}
				return output
			}
		}
	} else {
		base64 = function(input) {
			return Buffer.from(input).toString('base64')
		}
	}

	function slug(string, opts) {
		let result = slugify(string, opts)
		const fallback = opts && opts.fallback !== undefined ? opts.fallback : slug.defaults.fallback
		// If output is an empty string, try slug for base64 of string.
		if (fallback === true && result === '') {
			// Get rid of lone surrogates.
			let input = ''
			for (let i = 0; i < string.length; i++) {
				const charAndI = getWholeCharAndI(string, i)
				i = charAndI[1]
				input += charAndI[0]
			}
			result = slugify(base64(input), opts)
		}
		return result
	}

	const locales = {
		// http://www.eki.ee/wgrs/rom1_bg.pdf
		bg: {
			Й: 'Y',
			й: 'y',
			X: 'H',
			x: 'h',
			Ц: 'Ts',
			ц: 'ts',
			Щ: 'Sht',
			щ: 'sht',
			Ъ: 'A',
			ъ: 'a',
			Ь: 'Y',
			ь: 'y'
		},
		// Need a reference URL for German, although this is pretty well-known.
		de: {
			Ä: 'AE',
			ä: 'ae',
			Ö: 'OE',
			ö: 'oe',
			Ü: 'UE',
			ü: 'ue'
		},
		// Need a reference URL for Serbian.
		sr: {
			đ: 'dj',
			Đ: 'DJ'
		},
		// https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/864314/ROMANIZATION_OF_UKRAINIAN.pdf
		uk: {
			И: 'Y',
			и: 'y',
			Й: 'Y',
			й: 'y',
			Ц: 'Ts',
			ц: 'ts',
			Х: 'Kh',
			х: 'kh',
			Щ: 'Shch',
			щ: 'shch',
			Г: 'H',
			г: 'h'
		}
	}

	let defaultLocale = {}

	function slugify(string, opts) {
		if (typeof string !== 'string') {
			throw new Error('slug() requires a string argument, received ' + typeof string)
		}
		if (typeof opts === 'string') {
			opts = {
				replacement: opts
			}
		}
		opts = opts ? Object.assign({}, opts) : {}
		opts.mode = opts.mode || slug.defaults.mode
		const defaults = slug.defaults.modes[opts.mode]
		const keys = ['replacement', 'multicharmap', 'charmap', 'remove', 'lower', 'trim']
		for (let key, i = 0, l = keys.length; i < l; i++) {
			key = keys[i]
			opts[key] = (key in opts) ? opts[key] : defaults[key]
		}
		const localeMap = locales[opts.locale] || defaultLocale

		let lengths = []
		for (const key in opts.multicharmap) {
			if (!Object.prototype.hasOwnProperty.call(opts.multicharmap, key)) {
				continue
			}

			const len = key.length
			if (lengths.indexOf(len) === -1) {
				lengths.push(len)
			}
		}

		// We want to match the longest string if there are multiple matches, so
		// sort lengths in descending order.
		lengths = lengths.sort(function(a, b) {
			return b - a
		})

		const disallowedChars = opts.mode === 'rfc3986' ? /[^\w\s\-.~]/ : /[^A-Za-z0-9\s]/

		let result = ''
		for (let char, i = 0, l = string.length; i < l; i++) {
			char = string[i]
			let matchedMultichar = false
			for (let j = 0; j < lengths.length; j++) {
				const len = lengths[j]
				const str = string.substr(i, len)
				if (opts.multicharmap[str]) {
					i += len - 1
					char = opts.multicharmap[str]
					matchedMultichar = true
					break
				}
			}
			if (!matchedMultichar) {
				if (localeMap[char]) {
					char = localeMap[char]
				} else if (opts.charmap[char]) {
					char = opts.charmap[char].replace(opts.replacement, ' ')
				} else if (char.includes(opts.replacement)) {
					// preserve the replacement character in case it is excluded by disallowedChars
					char = char.replace(opts.replacement, ' ')
				} else {
					char = char.replace(disallowedChars, '')
				}
			}
			result += char
		}

		if (opts.remove) {
			result = result.replace(opts.remove, '')
		}
		if (opts.trim) {
			result = result.trim()
		};
		result = result.replace(/\s+/g, opts.replacement); // convert spaces
		if (opts.lower) {
			result = result.toLowerCase()
		}
		return result
	}

	const initialMulticharmap = {
		'।': '.',
		'‘': "' ",
		"’": " '",
	}
	const initialCharmap = {
		'अ': 'a',
		'आ': 'aa',
		'इ': 'i',
		'ई': 'ee',
		'उ': 'u',
		'ऊ': 'uu',
		'ए': 'e',
		'ऐ': 'ai',
		'ओ': 'o',
		'औ': 'ou',
		'ऍ': 'ei',
		'ऎ': 'ae',
		'ऑ': 'oi',
		'ऒ': 'oii',
		'अं': 'an',
		'अः': 'aha',
		'्': '',
		'ं': 'n',
		'ः': 'h',
		'ा': 'a',
		'ि': 'i',
		'ी': 'ee',
		'ू': 'oo',
		'ु': 'u',
		'े': 'e',
		'ै': 'ai',
		'ौ': 'au',
		'ो': 'o',

		//ka character hindi
		'क': 'Ka',
		'क्': 'K',
		'का': 'Kaa',
		'कि': 'Ki',
		'कू': 'koo',
		'कु': 'Ku',
		'की': 'Kee',
		'के': 'Ke',
		'कै': 'Kai',
		'को': 'Ko',
		'कौ': 'Kau',
		'कं': 'Kan',
		'कः': 'Kah',
		//kha character hindi
		'ख': 'Kha',
		'ख्': 'kh',
		'खा': 'Khaa',
		'खि': 'Khi',
		'खी': 'Khee',
		'खु': 'Khu',
		'खू': 'Khoo',
		'खे': 'Khe',
		'खै': 'Khai',
		'खो': 'Kho',
		'खौ': 'Khau',
		'खं': 'Khan',
		'खः': 'khah',

		'ग': 'Ga',
		'ग्': 'G',
		'गा': 'Gaa',
		'गि': 'Gi',
		'गी': 'Gee',
		'गु': 'Gu',
		'गू': 'Goo',
		'गे': 'Ge',
		'गै': 'Gai',
		'गो': 'Go',
		'गौ': 'Gau',
		'गं': 'Gan',
		'गः': 'Gah',
		'घ': 'Gha',
		'घ्': 'Gh',
		'घा': 'Ghaa',
		'घि': 'Ghi',
		'घी': 'Ghee',
		'घु': 'Ghu',
		'घू': 'Ghoo',
		'घे': 'Ghe',
		'घै': 'Ghai',
		'घो': 'Gho',
		'घौ': 'Ghau',
		'घं': 'Ghan',
		'घः': 'Ghah',
		//ch character in hindi
		'च': 'Cha',
		'चा': 'chaa',
		'च्': 'ch',
		'चि': 'chi',
		'ची': 'chee',
		'चु': 'chu',
		'चू': 'choo',
		'चे': 'che',
		'चै': 'chai',
		'चो': 'cho',
		'चौ': 'chau',
		'चौ': 'chau',
		'चौ': 'chau',
		'चं': 'chau',
		'चः': 'cha',

		'छ': 'Chha',
		'छा': 'Chhaa',
		'छि': 'Chhi',
		'छी': 'Chhee',
		'छु': 'Chhu',
		'छू': 'Chhoo',
		'छे': 'Chhe',
		'छै': 'Chhai',
		'छो': 'Chho',
		'छौ': 'Chhau',
		'छं': 'Chhan',
		'छः': 'Chhah',
		'छ्': 'Chh',
		//ja  hindi character
		'ज': 'Ja',
		'ज्': 'J',
		'जा': 'Jaa',
		'जि': 'Ji',
		'जी': 'Jee',
		'जु': 'Ju',
		'जू': 'Joo',
		'जे': 'Je',
		'जै': 'Jai',
		'जो': 'Jo',
		'जौ': 'Jau',
		'जं': 'Jan',
		'जः': 'Jah',
		//झ  hindi character
		'झ': 'Jha',
		'झा': 'Jhaa',
		'झ्': 'Jh',
		'झि': 'Jhi',
		'झी': 'Jhee',
		'झु': 'Jhu',
		'झू': 'Jhoo',
		'झे': 'Jhe',
		'झै': 'Jhai',
		'झो': 'Jho',
		'झौ': 'Jhau',
		'झं': 'Jhan',
		'झः': 'Jhah',

		'ट': 'Ta',
		'टा': 'Taa',
		'ट्': 'T',
		'टि': 'Ti',
		'टी': 'Tee',
		'टु': 'Tu',
		'टू': 'Too',
		'टे': 'Te',
		'टै': 'Tai',
		'टं': 'Tan',
		'टः': 'Tah',
		'टो': 'To',
		'टौ': 'Tau',

		'ठ': 'Tha',
		'ठ्': 'Th',
		'ठा': 'Thaa',
		'ठि': 'Thi',
		'ठी': 'Thee',
		'ठु': 'Thu',
		'ठू': 'Thoo',
		'ठे': 'The',
		'ठै': 'Thai',
		'ठो': 'Tho',
		'ठौ': 'Thau',
		'ठं': 'Than',
		'ठः': 'Thah',

		'ड': 'Da',
		'ड्': 'D',
		'डा': 'Daa',
		'डि': 'Di',
		'डी': 'Dee',
		'डु': 'Du',
		'डू': 'Doo',
		'डे': 'De',
		'डै': 'Dai',
		'डो': 'Do',
		'डौ': 'Dau',
		'डं': 'Dan',
		'डः': 'Dah',
		'ढ': 'Dha',
		'ढ्': 'Dh',
		'ढा': 'Dhaa',
		'ढि': 'Dhi',
		'ढी': 'Dhee',
		'ढु': 'Dhu',
		'ढू': 'Dhoo',
		'ढे': 'Dhe',
		'ढै': 'Dhai',
		'ढो': 'Dho',
		'ढौ': 'Dhau',
		'ढं': 'Dhan',
		'ढः': 'Dhah',

		'त': 'Ta',
		'त्': 'T',
		'ता': 'Taa',
		'ती': 'Tee',
		'ति': 'Ti',
		'तु': 'Tu',
		'तू': 'Too',
		'ते': 'Te',
		'तै': 'Tai',
		'तो': 'To',
		'तौ': 'Tau',
		'तं': 'Tan',
		'तः': 'Tah',

		'थ': 'Tha',
		'थ्': 'Th',
		'था': 'Thaa',
		'थि': 'Thi',
		'थी': 'Thee',
		'थु': 'Thu',
		'थू': 'Thoo',
		'थे': 'The',
		'थै': 'Thai',
		'थो': 'Tho',
		'थौ': 'Thau',
		'थं': 'Than',
		'थः': 'Thah',

		'द': 'Da',
		'द्': 'd',
		'दा': 'Daa',
		'दि': 'Di',
		'दी': 'Dee',
		'दु': 'Du',
		'दू': 'Doo',
		'दे': 'De',
		'दै': 'Dai',
		'दो': 'Do',
		'दौ': 'Dau',
		'दं': 'Dan',
		'दः': 'Dah',

		'ध': 'Dha',
		'ध्': 'Dh',
		'धा': 'Dhaa',
		'धि': 'Dhi',
		'धी': 'Dhee',
		'धु': 'Dhu',
		'धू': 'Dhoo',
		'धे': 'Dhe',
		'धै': 'Dhai',
		'धो': 'Dho',
		'धौ': 'Dhau',
		'धं': 'Dhan',
		'धः': 'Dhah',


		'न': 'Na',
		'न्': 'Na',
		'ना': 'Naa',
		'नि': 'Ni',
		'नी': 'Nee',
		'नु': 'Nu',
		'नू': 'Noo',
		'ने': 'Ne',
		'नै': 'Nai',
		'नो': 'No',
		'नौ': 'Nau',
		'नं': 'Nan',
		'नः': 'Nah',

		'प': 'Pa',
		'प्': 'P',
		'पा': 'Paa',
		'पि': 'Pi',
		'पी': 'Pee',
		'पु': 'Pu',
		'पू': 'Poo',
		'पे': 'Pe',
		'पै': 'Pai',
		'पो': 'Po',
		'पौ': 'Pau',
		'पं': 'Pan',
		'पः': 'Pah',


		'फ': 'Fa',
		'फ्': 'F',
		'फा': 'Faa',
		'फी': 'Fee',
		'फि': 'Fi',
		'फु': 'Fu',
		'फू': 'Foo',
		'फे': 'Fe',
		'फै': 'Fai',
		'फो': 'Fo',
		'फौ': 'Fau',
		'फं': 'Fan',
		'फः': 'Fah',


		'ब': 'Ba',
		'ब्': 'B',
		'बा': 'Baa',
		'बि': 'Bi',
		'बी': 'Bee',
		'बु': 'Bu',
		'बू': 'Boo',
		'बे': 'Be',
		'बै': 'Bai',
		'बो': 'Bo',
		'बौ': 'Bau',
		'बं': 'Ban',
		'बः': 'Bah',
		'भ': 'Bha',
		'भ्': 'Bh',
		'भा': 'Bhaa',
		'भि': 'Bhi',
		'भी': 'Bhee',
		'भु': 'Bhu',
		'भू': 'Bhoo',
		'भे': 'Bhe',
		'भै': 'Bhai',
		'भो': 'Bho',
		'भौ': 'Bhau',
		'भं': 'Bhan',
		'भः': 'Bhah',
		'म': 'Ma',
		'म्': 'M',
		'मा': 'Maa',
		'मि': 'Mi',
		'मी': 'Mee',
		'मु': 'Mu',
		'मू': 'Moo',
		'मे': 'Me',
		'मै': 'Mai',
		'मो': 'Mo',
		'मौ': 'Mau',
		'मं': 'Man',
		'मः': 'Mah',


		'य': 'Ya',
		'य्': 'Y',
		'या': 'Yaa',
		'यि': 'Yi',
		'यी': 'Yee',
		'यु': 'Yu',
		'यू': 'Yoo',
		'ये': 'Ye',
		'यै': 'Yai',
		'यो': 'Yo',
		'यौ': 'Yau',
		'यं': 'Yan',
		'यः': 'Yah',


		'र': 'Ra',
		'र्': 'R',
		'रा': 'Raa',
		'रि': 'Ri',
		'री': 'Ree',
		'रु': 'Ru',
		'रू': 'Roo',
		'रे': 'Re',
		'रै': 'Rai',
		'रो': 'Ro',
		'रौ': 'Rau',
		'रं': 'Ran',
		'रः': 'Rah',

		'ल': 'La',
		'ल्': 'L',
		'ला': 'Laa',
		'लि': 'Li',
		'ली': 'Lee',
		'लु': 'Lu',
		'लू': 'Loo',
		'ले': 'Le',
		'लै': 'Lai',
		'लो': 'Lo',
		'लौ': 'Lau',
		'लं': 'Lan',
		'लः': 'Lah',

		'व': 'Va',
		'व्': 'V',
		'वा': 'Vaa',
		'वि': 'Vi',
		'वी': 'Vee',
		'वु': 'Vu',
		'वू': 'Voo',
		'वे': 'Ve',
		'वै': 'Vai',
		'वो': 'Vo',
		'वौ': 'Vau',
		'वं': 'Van',
		'वः': 'Vah',

		'स': 'Sa',
		'स्': 'S',
		'सा': 'Saa',
		'सि': 'Si',
		'सी': 'See',
		'सु': 'Su',
		'सू': 'Soo',
		'से': 'Se',
		'सै': 'Sai',
		'सो': 'So',
		'सौ': 'Sau',
		'सं': 'San',
		'सः': 'Sah',
		'श': 'Sha',
		'श्': 'Sh',
		'शा': 'Shaa',
		'शि': 'Shi',
		'शी': 'Shee',
		'शु': 'Shu',
		'शू': 'Shoo',
		'शे': 'She',
		'शै': 'Shai',
		'शो': 'Sho',
		'शौ': 'Shau',
		'शं': 'Shan',
		'शः': 'Shah',

		'ष': 'Shha',
		'ष्': 'Shh',
		'षा': 'Shhaa',
		'षि': 'Shhi',
		'षी': 'Shhee',
		'षु': 'Shhu',
		'षू': 'Shhoo',
		'षे': 'Shhe',
		'षै': 'Shhai',
		'षो': 'Shho',
		'षौ': 'Shhau',
		'षं': 'Shhan',
		'षः': 'Shhah',
		'ह': 'Ha',
		'ह्': 'H',
		'हा': 'Haa',
		'हि': 'Hi',
		'ही': 'Hee',
		'हु': 'Hu',
		'हू': 'Hoo',
		'हे': 'He',
		'है': 'Hai',
		'हो': 'Ho',
		'हौ': 'Hau',
		'हं': 'Han',
		'हः': 'Hah',
		'क्ष': 'Ksha',
		'त्र': 'Tra',
		'ज्ञ': 'Gya',
		'ळ': 'Li',
		'ऌ': 'Li',
		'ऴ': 'Lii',
		'ॡ': 'Lii',
		'ङ': 'Na',
		'ञ': 'Nia',
		'ण': 'Nae',
		'ऩ': 'Ni',
		'ॐ': 'oms',
		'क़': 'Qi',
		'ऋ': 'Ri',
		'ॠ': 'Ri',
		'ऱ': 'Ri',
		'ड़': 'ugDha',
		'ढ़': 'ugDhha',
		'य़': 'Yi',
		'ज़': 'Za',
		'फ़': 'Fi',
		'ग़': 'Ghi',
	}

	slug.charmap = Object.assign({}, initialCharmap)
	slug.multicharmap = Object.assign({}, initialMulticharmap)
	slug.defaults = {
		charmap: slug.charmap,
		mode: 'pretty',
		modes: {
			rfc3986: {
				replacement: '-',
				remove: null,
				lower: true,
				charmap: slug.charmap,
				multicharmap: slug.multicharmap,
				trim: true
			},
			pretty: {
				replacement: '-',
				remove: null,
				lower: true,
				charmap: slug.charmap,
				multicharmap: slug.multicharmap,
				trim: true
			}
		},
		multicharmap: slug.multicharmap,
		fallback: true
	}

	slug.reset = function() {
		slug.defaults.modes.rfc3986.charmap = slug.defaults.modes.pretty.charmap = slug.charmap = slug.defaults.charmap = Object.assign({}, initialCharmap)
		slug.defaults.modes.rfc3986.multicharmap = slug.defaults.modes.pretty.multicharmap = slug.multicharmap = slug.defaults.multicharmap = Object.assign({}, initialMulticharmap)
		defaultLocale = ''
	}

	slug.extend = function(customMap) {
		const keys = Object.keys(customMap)
		const multi = {}
		const single = {}
		for (let i = 0; i < keys.length; i++) {
			if (keys[i].length > 1) {
				multi[keys[i]] = customMap[keys[i]]
			} else {
				single[keys[i]] = customMap[keys[i]]
			}
		}
		Object.assign(slug.charmap, single)
		Object.assign(slug.multicharmap, multi)
	}

	slug.setLocale = function(locale) {
		defaultLocale = locales[locale] || {}
	}

	if (typeof module !== 'undefined' && module.exports) { // CommonJS
		module.exports = slug
	} else { // Script tag
		root.slug = slug
	}
}(this))
