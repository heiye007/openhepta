--------------------- MODULE CardTagHighlightLifecycle ---------------------
EXTENDS Naturals, FiniteSets

CONSTANTS
  CARDS,
  TAGS,
  DOCS,
  HLS

VARIABLES
  aliveCards,
  aliveDocs,
  aliveHls,
  activeTags,
  cardRefs,
  cardTags,
  hlSource,
  hlTags

vars == <<aliveCards, aliveDocs, aliveHls, activeTags, cardRefs, cardTags, hlSource, hlTags>>

TypeOK ==
  /\ aliveCards \subseteq CARDS
  /\ aliveDocs \subseteq DOCS
  /\ aliveHls \subseteq HLS
  /\ activeTags \subseteq TAGS
  /\ cardRefs \subseteq (CARDS \times CARDS)
  /\ cardTags \subseteq (CARDS \times TAGS)
  /\ hlSource \in [HLS -> DOCS \cup {"NONE"}]
  /\ hlTags \subseteq (HLS \times TAGS)

Init ==
  /\ aliveCards = {}
  /\ aliveDocs = {}
  /\ aliveHls = {}
  /\ activeTags = {}
  /\ cardRefs = {}
  /\ cardTags = {}
  /\ hlSource = [h \in HLS |-> "NONE"]
  /\ hlTags = {}

CreateCard(c) ==
  /\ c \in CARDS \ aliveCards
  /\ aliveCards' = aliveCards \cup {c}
  /\ UNCHANGED <<aliveDocs, aliveHls, activeTags, cardRefs, cardTags, hlSource, hlTags>>

SoftDeleteCard(c) ==
  /\ c \in aliveCards
  /\ aliveCards' = aliveCards \ {c}
  /\ cardRefs' = { e \in cardRefs : e[1] # c /\ e[2] # c }
  /\ cardTags' = { p \in cardTags : p[1] # c }
  /\ UNCHANGED <<aliveDocs, aliveHls, activeTags, hlSource, hlTags>>

AddCardRef(src, dst) ==
  /\ src \in aliveCards
  /\ dst \in aliveCards
  /\ src # dst
  /\ <<src, dst>> \notin cardRefs
  /\ cardRefs' = cardRefs \cup {<<src, dst>>}
  /\ UNCHANGED <<aliveCards, aliveDocs, aliveHls, activeTags, cardTags, hlSource, hlTags>>

CreateTag(t) ==
  /\ t \in TAGS \ activeTags
  /\ activeTags' = activeTags \cup {t}
  /\ UNCHANGED <<aliveCards, aliveDocs, aliveHls, cardRefs, cardTags, hlSource, hlTags>>

DeleteTag(t) ==
  /\ t \in activeTags
  /\ activeTags' = activeTags \ {t}
  /\ cardTags' = { p \in cardTags : p[2] # t }
  /\ hlTags' = { p \in hlTags : p[2] # t }
  /\ UNCHANGED <<aliveCards, aliveDocs, aliveHls, cardRefs, hlSource>>

BindCardTag(c, t) ==
  /\ c \in aliveCards
  /\ t \in activeTags
  /\ <<c, t>> \notin cardTags
  /\ cardTags' = cardTags \cup {<<c, t>>}
  /\ UNCHANGED <<aliveCards, aliveDocs, aliveHls, activeTags, cardRefs, hlSource, hlTags>>

CreateDoc(d) ==
  /\ d \in DOCS \ aliveDocs
  /\ aliveDocs' = aliveDocs \cup {d}
  /\ UNCHANGED <<aliveCards, aliveHls, activeTags, cardRefs, cardTags, hlSource, hlTags>>

SoftDeleteDoc(d) ==
  /\ d \in aliveDocs
  /\ LET removedHls == { h \in aliveHls : hlSource[h] = d }
     IN
       /\ aliveDocs' = aliveDocs \ {d}
       /\ aliveHls' = aliveHls \ removedHls
       /\ hlSource' = [h \in HLS |-> IF h \in removedHls THEN "NONE" ELSE hlSource[h]]
       /\ hlTags' = { p \in hlTags : p[1] \notin removedHls }
       /\ UNCHANGED <<aliveCards, activeTags, cardRefs, cardTags>>

CreateHighlight(h, d) ==
  /\ h \in HLS \ aliveHls
  /\ d \in aliveDocs
  /\ aliveHls' = aliveHls \cup {h}
  /\ hlSource' = [hlSource EXCEPT ![h] = d]
  /\ UNCHANGED <<aliveCards, aliveDocs, activeTags, cardRefs, cardTags, hlTags>>

SoftDeleteHighlight(h) ==
  /\ h \in aliveHls
  /\ aliveHls' = aliveHls \ {h}
  /\ hlSource' = [hlSource EXCEPT ![h] = "NONE"]
  /\ hlTags' = { p \in hlTags : p[1] # h }
  /\ UNCHANGED <<aliveCards, aliveDocs, activeTags, cardRefs, cardTags>>

BindHighlightTag(h, t) ==
  /\ h \in aliveHls
  /\ t \in activeTags
  /\ <<h, t>> \notin hlTags
  /\ hlTags' = hlTags \cup {<<h, t>>}
  /\ UNCHANGED <<aliveCards, aliveDocs, aliveHls, activeTags, cardRefs, cardTags, hlSource>>

Next ==
  \/ \E c \in CARDS : CreateCard(c)
  \/ \E c \in CARDS : SoftDeleteCard(c)
  \/ \E s \in CARDS, d \in CARDS : AddCardRef(s, d)
  \/ \E t \in TAGS : CreateTag(t)
  \/ \E t \in TAGS : DeleteTag(t)
  \/ \E c \in CARDS, t \in TAGS : BindCardTag(c, t)
  \/ \E d \in DOCS : CreateDoc(d)
  \/ \E d \in DOCS : SoftDeleteDoc(d)
  \/ \E h \in HLS, d \in DOCS : CreateHighlight(h, d)
  \/ \E h \in HLS : SoftDeleteHighlight(h)
  \/ \E h \in HLS, t \in TAGS : BindHighlightTag(h, t)

Spec == Init /\ [][Next]_vars

NoGhostBacklinks ==
  \A e \in cardRefs : e[1] \in aliveCards /\ e[2] \in aliveCards /\ e[1] # e[2]

NoOrphanCardTags ==
  \A p \in cardTags : p[1] \in aliveCards /\ p[2] \in activeTags

HighlightsHaveAliveSource ==
  \A h \in aliveHls : hlSource[h] \in aliveDocs

NoOrphanHighlightTags ==
  \A p \in hlTags : p[1] \in aliveHls /\ p[2] \in activeTags

=============================================================================
